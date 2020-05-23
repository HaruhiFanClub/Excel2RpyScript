# encoding: utf-8

"""
    将Excel中的数据转化为rpy中的对象
"""
from corelib.exception import ParseFileException
from model.element import Text, Image, Transition, Audio, Role
from tools.excel import read_excel

ElementMapping = {
    "文本": Text,
    "立绘": Image,
    "背景": Image,
    "转场": Transition,
    "音效": Audio,
}

PositionMapping = {
    "left": "left",
    "right": "right",
    "mid": "center",
    "truecenter": "truecenter",
}

TransitionMapping = {
    "溶解": "dissolve",
    "褪色": "fade"
}


class Converter(object):

    def __init__(self, file_path):
        self.file_path = file_path
        self.roles = list()
        self.role_name_mapping = dict()

    def add_role(self, name):
        role = self.role_name_mapping.get(name)
        if not role:
            role = Role("role{}".format(len(self.role_name_mapping.keys())+1), name)
            self.role_name_mapping[name] = role
        return role

    def parse_file(self):
        """
        解析文件
        :return RpyElement列表
        """
        result = list()
        try:
            wb = read_excel(self.file_path)

            sheet1 = wb.sheet_by_index(0)  # 通过索引获取表格

            for idx in range(7, sheet1.nrows):
                data = [r.value for r in sheet1.row(idx)]
                if not any(data):
                    continue
                result.append(data)
        except ParseFileException as err:
            raise err
        return result

    def parse_by_row(self, last_role, row_data):
        # 当前角色、对话文本
        current_role_name, text = row_data[0], row_data[1]
        # 音乐、立绘、_、背景、备注、模式、音效、转场、_
        music, character, _, background, remark, mode, sound, transition, _ = row_data[18:]
        # 角色信息
        if last_role and current_role_name == "":
            current_role = last_role
        elif current_role_name not in ["", "旁白"]:
            current_role = self.add_role(current_role_name)
        else:
            current_role = None

        text = Text(text, current_role)
        # 音乐信息
        if music:
            cmd = "stop" if music == "none" else "play"
            text.add_triggers(Audio(music, cmd))
        # 立绘信息
        if character:
            characters = [Converter.generate_character(ch) for ch in character.split(";")]
            text.add_triggers(*characters)
        # 背景信息
        if background:
            text.add_triggers(Image(background, "scene"))
        # 音效
        if sound:
            cmd = "stop" if sound == "stop" else "sound"
            text.add_triggers(Audio(sound, cmd))
        # 转场
        if transition:
            t_style = TransitionMapping.get(transition, "")
            text.add_triggers(Transition(t_style))
        return current_role, text

    def generate_rpy_elements(self):
        current_role = None
        texts = list()
        for row in self.parse_file():
            current_role, text = self.parse_by_row(current_role, row)
            texts.append(text)
        return texts

    @classmethod
    def generate_character(cls, img_str):
        last_word = img_str.split(" ")[-1]
        position = PositionMapping.get(last_word, "left")
        if position:
            return Image(img_str.replace(last_word, "").strip(), "show", position)
        else:
            return Image(img_str, "show")
