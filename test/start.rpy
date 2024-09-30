define role1 = Character('长门', color="#c8c8ff", image="role1")
define role2 = Character('阿虚', color="#c8c8ff", image="role2")
define role3 = Character('春日', color="#c8c8ff", image="role3")
define narrator_nvl = Character(None, kind=nvl)
define narrator_adv = Character(None, kind=adv)
define config.voice_filename_format = "audio/{filename}"

label start:
show yuki 1 at center
scene bg20
with dissolve
voice "长门_sheet1_row8_synthesized.wav"
role1 "你好，我是SOS团的长门有希。"
voice "长门_sheet1_row9_synthesized.wav"
narrator_adv "正在进行新程序的测试，现在使用视觉小说转换器可以快速实现语音合成了。"
voice "长门_sheet1_row10_synthesized.wav"
narrator_adv "如果你想要低门槛地创作视觉小说，拓展性强的renpy是不错的选择。"
voice "长门_sheet1_row11_synthesized.wav"
narrator_adv "同时，视觉小说转换器是与renpy配合得很好的一项工具。"
voice "长门_sheet1_row12_synthesized.wav"
narrator_adv "renpy是一款专为制作视觉小说式游戏而打造的游戏引擎，基于Python开发，支持使用renpy脚本或直接编写Python语句，其性能与拓展性具有优势。"
voice "长门_sheet1_row13_synthesized.wav"
narrator_adv "经常与renpy进行比较的另一款引擎是unity。"
with dissolve
voice "长门_sheet1_row14_synthesized.wav"
narrator_adv "与unity相比，renpy在个人及小型团队的开发工作中不落下风。"
voice "长门_sheet1_row15_synthesized.wav"
narrator_adv "在中大型专业团队中，则unity因其更胜一筹的拓展性与美术资产管理能力而领先。"
voice "长门_sheet1_row16_synthesized.wav"
narrator_adv "不过renpy的另一项优势则是较低的门槛。"
voice "长门_sheet1_row17_synthesized.wav"
narrator_adv "renpy的脚本语言编写简单，掌握起来仅比图形开发工具难上一些，且熟练后拥有更高的开发效率与开发空间。"
voice "长门_sheet1_row18_synthesized.wav"
voice "长门_sheet1_row19_synthesized.wav"
menu:
    "了解视觉小说转换器在个人开发中的功用":
        jump sheet2

    "了解视觉小说转换器在团队开发中的功用":
        jump sheet3
