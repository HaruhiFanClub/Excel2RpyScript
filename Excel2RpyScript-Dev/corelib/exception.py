# encoding: utf-8
"""
    一些自定义的异常，方便排查问题
"""


class ConvertException(Exception):
    """
        项目异常基类
    """

    def __init__(self, msg):
        Exception.__init__(self, msg)
        self.msg = msg


class ParseFileException(ConvertException):
    """
        解析文件出现问题，读取Excel时出现
    """

    pass


class RenderException(ConvertException):
    """
        渲染Rpy对象时出现的异常
    """

    pass


class SaveFileException(ConvertException):
    """
        保存Rpy对象时出现的异常
    """

    pass
