# encoding: utf-8
"""
    一些自定义的异常，方便排查问题
"""


class ParseFileException(Exception):
    """
        解析文件出现问题，读取Excel时出现
    """

    def __init__(self, msg):
        super(ParseFileException, self).__init__(msg)
        self.msg = msg


class RenderException(Exception):
    """
        渲染Rpy对象时出现的异常
    """

    def __init__(self, msg):
        super(RenderException, self).__init__(msg)
        self.msg = msg


class ConvertException(Exception):

    def __init__(self, msg):
        super(ConvertException, self).__init__(msg)
        self.msg = msg


class SaveFileException(Exception):

    def __init__(self, msg):
        super(SaveFileException, self).__init__(msg)
        self.msg = msg

class VoiceException(Exception):
    def __init__(self, msg):
        super(VoiceException, self).__init__(msg)
        self.msg = msg