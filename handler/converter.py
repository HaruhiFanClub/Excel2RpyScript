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

    def generate_rpy_elements(self):
        result = []
        parsed_sheets = self.parser.get_parsed_sheets()
        for idx, parsed_sheet in enumerate(parsed_sheets):
            if idx == 0:
                label = 'start'
            else:
                label = parsed_sheet.name
            result.append(SheetConvertResult(label=label, data=self.parse_by_sheet(parsed_sheet.row_values)))
        return result

    @classmethod
    def generate_character(cls, img_str):
        last_word = img_str.split(" ")[-1]
        position = PositionMapping.get(last_word)
        if position:
            return Image(img_str.replace(last_word, "").strip(), "show", position)
        else:
            return Image(img_str.replace(last_word, "").strip(), ImageCmdMapping.get(last_word, "hide"))

    def parse_by_sheet(self, values):
        result = []
        for row_value in values:
            result.append(self.parse_by_row_value(row_value))
        return result

    def parse_by_row_value(self, row):
        row_converter = RowConverter(row, self)
        return row_converter.convert()


class RowConverter(object):

    def __init__(self, row, converter):
        self.row = row
        self.converter = converter

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
        if role_name not in ["", "旁白"]:
            # 当其他角色出现时，重置模式为nvl
            self.converter.current_role = self.converter.add_role(role_name)
        elif role_name == "" and self.converter.current_mode == "":
            return self.converter.current_role
        else:
            self.converter.current_role = Role("narrator_{}".format(self.converter.current_mode), "None")
        # elif role_name != "":
        #     # 当其他角色出现时，重置模式为nvl
        #     self.converter.current_role = self.converter.add_role(role_name)
        #     self.converter.current_mode = "nvl"
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
        # 立绘
        character_str = str(self.row[ElementColNumMapping.get('character')]).strip()
        if not character_str:
            return []
        characters = []
        # 新立绘出现时回收旧立绘
        for character in self.converter.characters:
            characters.append(Image(character.name, 'hide'))
        new_characters = [Converter.generate_character(ch) for ch in character_str.split(";")]
        self.converter.characters = new_characters
        characters.extend(new_characters)
        return characters

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
