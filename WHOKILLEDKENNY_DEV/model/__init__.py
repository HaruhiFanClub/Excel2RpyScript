# encoding: utf-8


class RpyElement(object):

    def render(self):
        pass


# 触发器
class Trigger(object):

    def __init__(self, cmd):
        self.cmd = cmd

    def trigger(self):
        pass


