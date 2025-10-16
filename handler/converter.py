#!/usr/bin/env python
# -*- coding:utf-8 -*-
"""
    将Excel中的数据转化为rpy中的对象
"""
from collections import namedtuple

from const.converter_setting import ElementColNumMapping, PositionMapping, ImageCmdMapping, TransitionMapping, \
    ReplaceCharacterMapping
from model.element import Text, Image, Transition, Audio, Role, Command, Voice, Menu

SheetConvertResult = namedtuple('SheetConvertResult', ['label', 'data'])

RowConvertResult = namedtuple('RowConvertResult',
                              ['role',  # 角色
                               'mode',  # 模式
                               'text',  # 文本
                               'music',  # 音乐
                               'character',  # 立绘
                               'change_page',  # 换页
                               'background',  # 背景
                               'remark',  # 备注
                               'sound',  # 音效
                               'transition',  # 转场
                               'voice',  # 语音
                               'menu',  # 条件跳转
                               'side_character'  # 头像
                               ])


class Converter(object):

    def __init__(self, parser):
        self.parser = parser
        self.roles = list()
        self.role_name_mapping = dict()
        self.current_mode = 'nvl'
        self.current_role = Role("narrator_nvl", "None")
        self.characters = list()
        self.side_characters = dict()

    def add_role(self, name):
        role = self.role_name_mapping.get(name)
        if not role:
            role = Role("role{}".format(len(self.role_name_mapping.keys()) + 1), name)
            self.role_name_mapping[name] = role
        return role

    #创建一个元组，存有工作表标签及对应工作表下的多行转换后数据
    def generate_rpy_elements(self):
        result = []
        parsed_sheets = self.parser.get_parsed_sheets()
        for idx, parsed_sheet in enumerate(parsed_sheets):
            if idx == 0:
                label = 'start'
            else:
                label = parsed_sheet.name
            result.append(SheetConvertResult(label=label, data=self.parse_by_sheet(parsed_sheet.row_values, idx)))
        return result

    @classmethod
    def generate_character(cls, img_str):
        last_word = img_str.split(" ")[-1]
        position = PositionMapping.get(last_word, None) or last_word
        if position:
            return Image(img_str.replace(last_word, "").strip(), "show", position)
        else:
            return Image(img_str.replace(last_word, "").strip(), ImageCmdMapping.get(last_word, "hide"))

    #循环调用parse_by_row_value方法，返回拼接多行转换后信息的列表
    def parse_by_sheet(self, values, sheet_index):
        result = []
        current_role_name = None  # 用于跟踪最近的有效 role_name
        for row_index, row_value in enumerate(values):
            role_name = row_value[ElementColNumMapping.get('role_name')]
            if role_name.strip():
                current_role_name = role_name  # 更新最近的有效 role_name
            else:
                role_name = current_role_name  # 如果当前 role_name 为空，使用最近的有效值
            result.append(self.parse_by_row_value(row_value, role_name, sheet_index, row_index))
        return result

    #调用RowConverter的convert方法，返回存有单行转换后信息的元组
    def parse_by_row_value(self, row, role_name, sheet_index, row_index):
        row_converter = RowConverter(row, self, role_name, sheet_index, row_index)
        return row_converter.convert()


class RowConverter(object):

    def __init__(self, row, converter, role_name, sheet_index, row_index):
        self.row = row
        self.converter = converter
        self.role_name = role_name  
        self.row_index = row_index  
        self.sheet_index = sheet_index
    
    #该方法返回存有单行转换后信息的元组
    def convert(self):
        return RowConvertResult(
            mode=self._converter_mode(),
            role=self._converter_role(),
            text=self._converter_text(),
            music=self._converter_music(),
            character=self._converter_character(),
            change_page=self._converter_change_page(),
            background=self._converter_background(),
            remark=self._converter_remark(),
            sound=self._converter_sound(),
            transition=self._converter_transition(),
            voice=self._converter_voice(),
            menu=self._converter_menu(),
            side_character=self._converter_side_character(),
        )

    def _converter_mode(self):
        # 模式
        mode = self.row[ElementColNumMapping.get('mode')]
        if mode:
            self.converter.current_mode = mode
        return mode

    def _converter_role(self):
        # 角色
        role_name = self.row[ElementColNumMapping.get('role_name')]
        if role_name and role_name != "旁白":
            # 当新的角色名出现时，切换到该角色
            self.converter.current_role = self.converter.add_role(role_name)
            #self.converter.current_mode = "nvl"  # 可选：根据需要设置当前模式
        elif role_name == "":
            # 空角色名时，保持当前角色不变
            return self.converter.current_role
        else:
            # 处理旁白角色或其他情况
            self.converter.current_role = Role("narrator_{}".format(self.converter.current_mode), "None")
        
        return self.converter.current_role

    def _converter_text(self):
        # 文本
        text = str(self.row[ElementColNumMapping.get('text')]).replace("\n", "\\n")
        if not text:
            return None
        replace_index_char = []
        for idx, t in enumerate(text):
            if ReplaceCharacterMapping.get(t):
                replace_index_char.append((idx, t))

        if replace_index_char:
            new_text_list = list(text)
            for idx, char in replace_index_char:
                new_text_list[idx] = ReplaceCharacterMapping.get(char)
            text = ''.join(new_text_list)
        return Text(text, self.converter.current_role)

    def _converter_music(self):
        # 音乐
        music = self.row[ElementColNumMapping.get('music')]
        if not music:
            return None
        cmd = "stop" if music == "none" else "play"
        return Audio(music, cmd)

    def _converter_background(self):
        # 背景
        background = self.row[ElementColNumMapping.get('background')]
        if not background:
            return None
        return Image(background, "scene")

    def _converter_character(self):
        character_str = str(self.row[ElementColNumMapping['character']]).strip()
        # --- 1. 统一地回收旧立绘 ---
        hide_images = [Image(char.name, 'hide') for char in self.converter.characters]
        # --- 2. 若本行没有立绘，只需回收后结束 ---
        if not character_str:
            # 清空缓存，避免残留
            self.converter.characters = []
            return hide_images            # 只返回“hide”指令
        # --- 3. 解析并生成新立绘 ---
        new_characters = [
            Converter.generate_character(ch)
            for ch in character_str.split(';') if ch.strip()
        ]
        # 更新缓存为当前行的新立绘
        self.converter.characters = new_characters
        # 返回：先隐藏旧立绘，再展示新立绘
        return hide_images + new_characters

    def _converter_remark(self):
        pass

    def _converter_sound(self):
        # 音效
        sound = self.row[ElementColNumMapping.get('sound')]
        if not sound:
            return None
        if sound.startswith('循环'):
            return Audio(sound.replace('循环', ''), 'loop')
        else:
            cmd = "stop" if sound == "stop" else "sound"
            return Audio(sound, cmd)

    def _converter_transition(self):
        # 转场
        transition = self.row[ElementColNumMapping.get('transition')]
        if not transition:
            return None
        t_style = TransitionMapping.get(transition, "")
        return Transition(t_style)

    def _converter_change_page(self):
        # 换页
        change_page = self.row[ElementColNumMapping.get('change_page')]
        if not change_page:
            return None
        return Command("nvl clear")

    def _converter_voice(self):
        voice_str = str(self.row[ElementColNumMapping.get('voice')]).strip()
        if not voice_str:
            return None
        
        # 检查是否包含 "tts"
        if voice_str.lower().strip() == "tts":
            return Voice(f"{self.role_name}_sheet{self.sheet_index+1}_row{self.row_index+8}_synthesized.wav")
        
        if voice_str.split(" ")[-1] == "sustain":
            voice_name = voice_str.split(" ")[0]
            return Voice(voice_name, sustain=True)
        else:
            return Voice(voice_str)

    def _converter_menu(self):
        # 分支条件的label写在对话文本列
        menu = self.row[ElementColNumMapping.get('menu')]
        if not menu:
            return None
        text = str(self.row[ElementColNumMapping.get('text')]).replace("\n", "\\n")
        if not text:
            return None
        replace_index_char = []
        for idx, t in enumerate(text):
            if ReplaceCharacterMapping.get(t):
                replace_index_char.append((idx, t))

        if replace_index_char:
            new_text_list = list(text)
            for idx, char in replace_index_char:
                new_text_list[idx] = ReplaceCharacterMapping.get(char)
            text = ''.join(new_text_list)
        return Menu(label=text, target=menu)

    def _converter_side_character(self):
        # 对话框头像
        character_str = str(self.row[ElementColNumMapping.get('side_character')]).strip()
        if not character_str:
            return None
        self.converter.side_characters[self.converter.current_role.pronoun] = character_str
        return None

    def _converter_voice_cmd(self):
        pass