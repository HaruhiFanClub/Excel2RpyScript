# RPY元素与sheet中每列的对应关系
from model.element import Text, Image, Transition, Audio

ElementColNumMapping = {
    'role_name': 0,
    'text': 1,
    'character': 18,
    'background': 19,
    'transition': 20,
    'music': 21,
    'voice': 22,
    'voice_cmd':23,
    'mode': 24,
    'change_page': 25,
    'sound': 26,
    'side_character': 27,
    'menu': 28,
    'remark': 29,
}

# 元素映射
ElementMapping = {
    "文本": Text,
    "立绘": Image,
    "背景": Image,
    "转场": Transition,
    "音效": Audio,
}

# 位置映射
PositionMapping = {
    "left": "left",
    "right": "right",
    "mid": "center",
    "truecenter": "truecenter",
}

# 图片指令
ImageCmdMapping = {
    "hide": "hide",
}

# 转场指令
TransitionMapping = {
    "溶解": "dissolve",
    "褪色": "fade",
    "闪白": "Fade(0.1,0.0,0.5,color=\"#FFFFFF\")",
    "像素化": "pixellate",
    "横向振动": "hpunch",
    "纵向振动": "vpunch",
    "百叶窗": "blinds",
    "网格覆盖": "squares",
    "擦除": "wipeleft",
    "滑入": "slideleft",
    "滑出": "slideawayleft",
    "推出": "pushright",
}

# 音效指令
SoundCmdMapping = {
    "循环": "loop"
}

ReplaceCharacterMapping = {
    "%": "\\%",  # % --> \%
    "\"": "\\\"",  # " -> \"
    "\'": "\\\'",  # ' -> \'
    "{": "{{",  # { -> {{
    "[": "[[",  # [ -> [[
}
