# encoding: utf-8

"""
    将Excel中的数据转化为rpy中的对象
"""
from corelib.exception import ParseFileException
from model.element import Text, Image, Transition, Audio, Role, Mode, Command
from tools.excel import read_excel

SPECIAL_CHAR = ['\\','%','{','}']

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

ImageCmdMapping = {
    "hide": "hide",
}

TransitionMapping = {
    "溶解": "dissolve",
    "褪色": "fade",
    "闪白": "Fade(0.1,0.0,0.5,color=\"#FFFFFF\")",
    "像素化": "pixellate",
    "横向振动": "hpunch",
    "纵向振动": "vpunch",
    "百叶窗": "blinds",
    "网格覆盖": "squares",
    "擦除": "wipeleft",
    "滑入": "slideleft",
    "滑出": "slideawayleft",
    "推出": "pushright",
}

SoundCmdMapping = {
    "循环": "loop"
}


class Converter(object):

    def __init__(self, file_path):
        self.file_path = file_path
        self.roles = list()
        self.role_name_mapping = dict()

    def add_role(self, name):
        role = self.role_name_mapping.get(name)
        if not role:
            role = Role("role{}".format(len(self.role_name_mapping.keys()) + 1), name)
            self.role_name_mapping[name] = role
        return role

    def parse_file(self):
        """
        解析文件
        :return RpyElement列表
        """
        cnt = 0
        try:
            wb = read_excel(self.file_path)
            cnt = len(wb.sheets())
        except ParseFileException as err:
            raise err
        result = []
        for sheet in wb.sheets():
            sheet_data = []
            for i in range(7, sheet.nrows):
                data = [r.value for r in sheet.row(i)]
                if not any(data):
                    continue
                sheet_data.append(data)
            result.append(sheet_data)
        return result

    def parse_by_row(self, last_role, last_mode, row_data):
        # 当前角色、对话文本
        current_role_name, text = row_data[0], row_data[1]
        l_text = (list)(text)
        for n_char in SPECIAL_CHAR:
            flg = True
            for i, n_ele in enumerate(l_text):
                if n_ele == n_char and flg:
                    l_text.insert(i, '\\')
                    flg = False
                else:
                    flg = True
        text = ''.join(l_text)

        # 音乐、立绘、换页、背景、备注、模式、音效、转场、特殊效果
        music, character, change_page, background, remark, mode, sound, transition, _ = row_data[18:]
        # nvl模式
        if mode == 'nvl':
            current_mode = 'nvl'
        elif mode == 'adv':
            current_mode = 'adv'
        else:
            current_mode = last_mode
        # 角色信息
        if last_role and current_role_name == "":
            current_role = last_role
        elif current_role_name not in ["", "旁白"]:
            current_role = self.add_role(current_role_name)
        elif current_mode == 'adv':
            current_role = Role("narrator_adv", "None")
        elif current_mode == 'nvl':
            current_role = Role("narrator_nvl", "None")
        else:
            current_role = None

        text = Text(text, current_role)
        text.add_triggers(Mode(current_mode))
        # 音乐信息
        if music:
            cmd = "stop" if music == "none" else "play"
            text.add_triggers(Audio(music, cmd))
        # 背景信息
        if background:
            text.add_triggers(Image(background, "scene"))
        # 立绘信息
        if character:
            characters = [Converter.generate_character(ch) for ch in character.split(";")]
            text.add_triggers(*characters)
        # 音效
        if sound:
            if sound.startswith('循环'):
                text.add_triggers(Audio(sound.replace('循环', ''), 'loop'))
            else:
                cmd = "stop" if sound == "stop" else "sound"
                text.add_triggers(Audio(sound, cmd))
        # 转场
        if transition:
            t_style = TransitionMapping.get(transition, "")
            text.add_triggers(Transition(t_style))
        # 换页
        if change_page:
            text.add_triggers(Command("nvl clear"))
        return current_mode, current_role, text

    def generate_rpy_elements(self):
        current_role = None
        current_mode = None
        try:
            tmp = self.parse_file()
        except ParseFileException as err:
            raise err
        texts = []
        for i in tmp:
            n_text = []
            for row in i:
                current_mode, current_role, text = self.parse_by_row(current_role, current_mode, row)
                n_text.append(text)
            texts.append(n_text)
        return texts

    @classmethod
    def generate_character(cls, img_str):
        last_word = img_str.split(" ")[-1]
        position = PositionMapping.get(last_word)
        if position:
            return Image(img_str.replace(last_word, "").strip(), "show", position)
        else:
            return Image(img_str.replace(last_word, "").strip(), ImageCmdMapping.get(last_word, "hide"))
