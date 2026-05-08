#!/usr/bin/env python
# -*- coding:utf-8 -*-
"""
基本的 Excel 校对：把每张工作表的错误/警告输出到 saveAddress/log.txt。

TODO:
1. 检测素材文件是否真实存在
2. 预定义检测列改为随表头动态获取
3. 凉宫春日特别套装、跨表对比等其他规则
"""

import os
from time import strftime

from const.converter_setting import ElementColNumMapping, PositionMapping, TransitionMapping
from const.parser_setting import EXCEL_PARSE_START_ROW

# Parser 从 EXCEL_PARSE_START_ROW（0-indexed）开始读，Excel 行号是 1-indexed，
# 因此真实行号 = enumerate 索引 + EXCEL_PARSE_START_ROW + 1
_ROW_NUMBER_OFFSET = EXCEL_PARSE_START_ROW + 1

_FACE_PLACES = set(PositionMapping.keys())
_TRANSITIONS = set(TransitionMapping.keys())

_FACE_GAP_THRESHOLD = 10
_BG_GAP_THRESHOLD = 80
_MUSIC_GAP_THRESHOLD = 80
_MAX_TEXT_LEN = 60

_COL = ElementColNumMapping


class XlsProofreader:
    def __init__(self, parser, saveAddress):
        self.parser = parser
        self.saveAddress = saveAddress

    def proofread(self):
        """对所有工作表做校对，并把结果追加到 saveAddress/log.txt。

        :return: (total_errors, total_warnings) 全文件累计错误/警告数
        """
        log_path = os.path.join(self.saveAddress, 'log.txt')
        sheets = self.parser.get_parsed_sheets()
        sheet_names = {sheet.name for sheet in sheets}

        total_errors = 0
        total_warnings = 0

        with open(log_path, 'a', encoding='utf-8') as f:
            f.write('\n==== {} ====\n'.format(strftime('%Y-%m-%d %H:%M:%S')))
            for sheet in sheets:
                f.write('Sheet: {}\n'.format(sheet.name))
                errors, warnings = self._proofread_sheet(sheet, sheet_names, f)
                f.write('合计：错误：{}，警告：{}\n'.format(errors, warnings))
                total_errors += errors
                total_warnings += warnings

        return total_errors, total_warnings

    def _proofread_sheet(self, sheet, sheet_names, f):
        errors = 0
        warnings = 0
        face_gap = 0
        bg_gap = 0
        music_gap = 0

        for idx, row in enumerate(sheet.row_values):
            row_no = idx + _ROW_NUMBER_OFFSET

            text = row[_COL['text']]
            if len(str(text)) >= _MAX_TEXT_LEN:
                f.write('警告：第{}行 台词字数超过{}字\n'.format(row_no, _MAX_TEXT_LEN))
                warnings += 1

            voice_text = row[_COL['voice_text']]
            voice = row[_COL['voice']]
            if voice_text and voice != 'tts':
                f.write('警告：第{}行 存在选填语音文本，但未使用TTS功能\n'.format(row_no))
                warnings += 1

            character = row[_COL['character']]
            transition = row[_COL['transition']]
            if character:
                face_gap = 0
                tokens = str(character).split()
                if len(tokens) == 1:
                    # 单关键字（如 hide）走 ImageCmdMapping，是合法图片指令
                    pass
                elif len(tokens) >= 2:
                    place = tokens[-1]
                    if place not in _FACE_PLACES:
                        f.write('错误：第{}行 不合法的立绘位置"{}"\n'.format(row_no, place))
                        errors += 1
                    if not transition:
                        f.write('警告：第{}行 立绘变化了但转场为空\n'.format(row_no))
                        warnings += 1
                else:
                    f.write('错误：第{}行 立绘列未按照"文件名+空格+位置"的形式填写\n'.format(row_no))
                    errors += 1
            else:
                face_gap += 1
                if face_gap == _FACE_GAP_THRESHOLD:
                    f.write('警告：第{}行 超过{}行仍未更换立绘\n'.format(row_no, _FACE_GAP_THRESHOLD))
                    warnings += 1

            background = row[_COL['background']]
            if background:
                bg_gap = 0
                if not transition:
                    f.write('警告：第{}行 背景变化了但转场为空\n'.format(row_no))
                    warnings += 1
            else:
                bg_gap += 1
                if bg_gap == _BG_GAP_THRESHOLD:
                    f.write('警告：第{}行 超过{}行仍未更换背景\n'.format(row_no, _BG_GAP_THRESHOLD))
                    warnings += 1

            if transition and transition not in _TRANSITIONS:
                f.write('错误：第{}行 不合法的转场类型"{}"\n'.format(row_no, transition))
                errors += 1

            music = row[_COL['music']]
            if music:
                music_gap = 0
            else:
                music_gap += 1
                if music_gap == _MUSIC_GAP_THRESHOLD:
                    f.write('警告：第{}行 超过{}行仍未更换音乐\n'.format(row_no, _MUSIC_GAP_THRESHOLD))
                    warnings += 1

            voice_cmd = row[_COL['voice_cmd']]
            if voice == 'tts' and not voice_cmd:
                f.write('错误：第{}行 使用了TTS功能，但未填写语音指令/参考音频\n'.format(row_no))
                errors += 1
            if voice_cmd and voice != 'tts':
                f.write('警告：第{}行 填写了语音指令/参考音频，但未使用TTS功能\n'.format(row_no))
                warnings += 1

            mode = row[_COL['mode']]
            change_page = row[_COL['change_page']]
            if mode == 'nvl' and change_page != '换页':
                f.write('警告：第{}行 切换至nvl模式时未进行换页操作\n'.format(row_no))
                warnings += 1

            sound = row[_COL['sound']]
            if sound and not isinstance(sound, str):
                f.write('错误：第{}行 音效名不得为纯数字\n'.format(row_no))
                errors += 1

            if row[_COL['side_character']]:
                f.write('警告：第{}行 角色头像列尚未充分实现\n'.format(row_no))
                warnings += 1

            menu = row[_COL['menu']]
            if menu and str(menu) not in sheet_names:
                f.write('错误：第{}行 分支跳转的工作表不存在\n'.format(row_no))
                errors += 1

        return errors, warnings
