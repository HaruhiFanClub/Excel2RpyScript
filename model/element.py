# encoding: utf-8
"""
    Rpy游戏的基本元素
"""
from corelib.exception import RenderException
from model import RpyElement, Trigger

TEXT_TEMPLATE = "{character}\"{text}\""  # 对话模板
CHARACTER_TEMPLATE = "define {name} = Character('{role}}', color=\"{color}\")"  # 角色模板


# 对话
class Text(RpyElement, Trigger):

    def __init__(self, text, character, cmd=''):
        """
        :param text: 文本
        :param character: 角色
        :param cmd: 指令
        """
        super(Text).__init__(cmd)
        self.text = text
        self.character = character

    def render(self):
        return TEXT_TEMPLATE.format(character=self.character.name, text=self.text)


# 角色
class Character(RpyElement):

    def __init__(self, name, role, img, color):
        """
        :param name: 代称
        :param role: 角色名
        :param img: 图像类
        :param color: 颜色
        """
        self.name = name
        self.role = role
        self.img = img
        self.color = color

    def render(self):
        return CHARACTER_TEMPLATE.format(name=self.name, role=self.role, color=self.color)


# 图像
class Image(RpyElement):

    def __init__(self, name, cmd, position=""):
        """
        :param name: 图像名
        :param cmd: 指令: hide、scene、show
        :param position: 位置：left 表示界面左端， right 表示屏幕右端， center 表示水平居中(默认位置)， truecenter 表示水平和垂直同时居中。
        """
        self.name = name
        self.cmd = cmd
        self.position = position

    # 当某个角色离开但场景不变化时，才需要使用hide
    def hide(self):
        return "hide {name}".format(name=self.name)

    # 清除所有图像并显示了一个背景图像
    def scene(self):
        return "scene {name}".format(name=self.name)

    def show(self):
        if self.position:
            return "show {name}".format(name=self.name)
        else:
            return "show {name} at {position}".format(name=self.name, position=self.position)

    def render(self):
        if self.cmd == 'show':
            return self.show()
        elif self.cmd == 'scene':
            return self.scene()
        elif self.cmd == 'hide':
            return self.hide()
        else:
            raise RenderException("不存在的Image指令:{}".format(self.cmd))


# 转场
class Transition(RpyElement):

    def __init__(self, style):
        """
        :param style: 转场效果：dissolve (溶解)、fade (褪色)、None (标识一个特殊转场效果,不产生任何特使效果)
        """
        self.style = style

    def render(self):
        return "with {}".format(self.style)


# 音效
class Audio(RpyElement):

    def __init__(self, name, cmd, **args):
        """
        :param name: 音效名
        :param cmd: 指令
        :param args: 参数 fadeout/fadein: 音乐的淡入淡出  next_audio:下一个音效
        """
        self.name = name
        self.cmd = cmd
        self.fadeout = args.get("fadeout", 0)
        self.fadein = args.get("fadein", 0)
        self.next_audio = args.get("next_audio")

    # 循环播放音乐
    def play(self):
        return "play music \"{}\"".format(self.name)

    # 用于旧音乐的淡出和新音乐的淡入
    def fade(self):
        return self.play() + "fadeout {fadeout} fadein {fadein}".format(fadeout=self.fadeout, fadein=self.fadein)

    # 当前音乐播放完毕后播放的音频文件
    def queue(self):
        if self.next_audio:
            return "queue \"{audio_name}\"".format(audio_name=self.next_audio.name)
        else:
            return self.play()

    # 不会循环播放
    def sound(self):
        return "play sound \"{}\"".format(self.name)

    # 停止播放音乐
    def stop(self):
        return "stop \"{}\"".format(self.name)

    def render(self):
        if self.cmd == 'play':
            return self.play()
        elif self.cmd == 'fade':
            return self.fade()
        elif self.cmd == 'queue':
            return self.queue()
        elif self.cmd == 'sound':
            return self.sound()
        elif self.cmd == 'stop':
            return self.stop()
        else:
            raise RenderException("不存在的Audio指令:{}".format(self.cmd))


