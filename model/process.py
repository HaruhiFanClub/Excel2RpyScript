# encoding: utf-8

"""
    Rpy游戏的进程控制
"""


class Menu(object):
    pass


class Label(object):

    def __init__(self,tag):
        """
        :param tag: 标签名
        """
        self.tag=tag

    def render(self):
        return "label "+self.tag+":"


class Jump(object):
    pass

class Pause(object):

    def __init__(self,time=''):
        """
        :param time: 暂停的时长
        """
        self.time=" "+time

    def render(self):
        return "pause"+self.time

