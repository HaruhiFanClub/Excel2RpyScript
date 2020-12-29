#!/usr/bin/env python
# -*- coding:utf-8 -*-
from collections import namedtuple

from const.parser_setting import EXCEL_PARSE_START_ROW, EXCEL_PARSE_START_COL
from corelib.exception import ParseFileException
from tools.excel import read_excel

# 解析结果(sheet粒度)，包含sheet和数据
SheetParseResult = namedtuple('ParseResult', ['name', 'row_values'])


class Parser(object):
    """
    Excel解析器
    """

    def __init__(self, file_path):
        self.file_path = file_path

    def get_excel_wb(self):
        """
        解析文件
        :return RpyElement列表
        """
        try:
            wb = read_excel(self.file_path)
        except ParseFileException as err:
            raise err
        return wb

    def get_parsed_sheets(self):
        """
        解析文件
        :return RpyElement列表
        """
        wb = self.get_excel_wb()
        result = []
        for sheet in wb.sheets():
            result.append(SheetParseResult(name=sheet.name, row_values=self.parse_sheet(sheet)))
        return result

    def parse_sheet(self, sheet):
        result = []
        for i in range(EXCEL_PARSE_START_ROW, sheet.nrows):
            data = [r.value for r in sheet.row(i)]
            if not any(data):
                continue
            if len(data) < EXCEL_PARSE_START_COL:
                # 补全数据
                data.extend(["" for i in range(EXCEL_PARSE_START_COL - len(data))])
            assert len(data) == EXCEL_PARSE_START_COL
            result.append(data)
        return result
