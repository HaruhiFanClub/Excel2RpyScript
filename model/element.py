# encoding: utf-8
"""
    Rpy游戏的基本元素
"""
from corelib.exception import RenderException
from model import RpyElement

ROLE_TEMPLATE = "define {name} = Character('{role}', color=\"{color}\")"  # 角色模板


# 对话
class Text(RpyElement):

    def __init__(self, text, role, triggers=None):
        """
        :param text: 文本
        :param role: 角色
        @:param triggers: 触发器：背景、音乐等等改变
        """
        self.text = text
        self.role = role
        self.triggers = triggers or list()

    def render(self):
        # result = [t.render() for t in self.triggers]
        result = []
        if self.role:
            result.append("{character}{text}".format(character=self.role.pronoun, text=self.text))

        else:
            result.append(self.text)
        return "\n".join(result)

    def add_triggers(self, *triggers):
        if not self.triggers:
            self.triggers = triggers
        else:
            self.triggers += triggers


# 角色
class Role(RpyElement):

    def __init__(self, pronoun, name, color=None):
        """
        :param pronoun: 代称
        :param name: 角色名
        :param color: 颜色
        """
        self.pronoun = pronoun
        self.name = name
        self.color = color or "#c8c8ff"

    def render(self):
        if not self.name:
            return ""
        return ROLE_TEMPLATE.format(name=self.pronoun, role=self.name, color=self.color)


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
            return "show {name} at {position}".format(name=self.name, position=self.position)
        else:
            return "show {name}".format(name=self.name)

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
        return "with {}".format(self.style) if self.style else ""


# 音效
class Audio(RpyElement):

    def __init__(self, name, cmd, **args):
        """
        :param name: 音效名
        :param cmd: 指令
        :param args: 参数 fadeout/fadein: 音乐的淡入淡出  next_audio:下一个音效
        """
        if isinstance(name, float):
            self.name = str(int(name))
        elif isinstance(name, int):
            self.name = str(name)
        else:
            self.name = name
        if self.name.split(".")[-1].lower() != 'mp3':
            self.name += ".mp3"
        self.cmd = cmd
        self.fadeout = args.get("fadeout", 0.5)
        self.fadein = args.get("fadein", 0.5)
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

    # 不会循环播放
    def loop(self):
        return self.sound() + " loop"

    # 停止播放音乐
    def stop(self):
        return "stop music"

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
        elif self.cmd == 'loop':
            return self.loop()
        else:
            raise RenderException("不存在的Audio指令:{}".format(self.cmd))


class Mode(RpyElement):

    def __init__(self, mode):
        self.mode = mode

    def render(self):
        if self.mode == 'nvl':
            return ''
        else:
            return 'nvl clear'


# 自定义指令
class Command(RpyElement):
    def __init__(self, cmd):
        self.cmd = cmd

    def render(self):
        return self.cmd