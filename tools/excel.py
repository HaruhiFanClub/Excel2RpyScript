# encoding: utf-8

"""
    处理excel的工具
"""

import xlrd

from corelib.exception import ParseFileException


def read_excel(file_path):
    try:
        wb = xlrd.open_workbook(filename=file_path)
    except FileNotFoundError:
        raise ParseFileException("Excel文件不存在")
    return


if __name__ == '__main__':
    try:
        read_excel("D:\\test.xlsx")
    except ParseFileException as err:
        print(err.msg)

