define role1 = Character('阿虚', color="#c8c8ff", image="role1")
define role2 = Character('凉宫春日', color="#c8c8ff", image="role2")
define narrator_nvl = Character(None, kind=nvl)
define narrator_adv = Character(None, kind=adv)
define config.voice_filename_format = "audio/{filename}"

label start:
play music "audio/start.mp3"
scene bg xy005
show kyon 0030 at kyon_mid
with dissolve
voice "阿虚_sheet1_row8_synthesized.wav"
role1 "那个，春日，突然拉我过来是有什么事吗？"
hide kyon 0030
show haruhi 0903 at haruhi_mid
with dissolve
voice "凉宫春日_sheet1_row9_synthesized.wav"
role2 "当然啦，我有个好点子。"
hide haruhi 0903
show kyon 0034 at kyon_mid
with dissolve
voice "阿虚_sheet1_row10_synthesized.wav"
role1 "好~好~，让我们听听我们的团长大人又有什么新点子。"
hide kyon 0034
show haruhi 0611 at haruhi_mid
with dissolve
voice "凉宫春日_sheet1_row11_synthesized.wav"
role2 "我们做个游戏吧！"
hide haruhi 0611
show kyon 0021 at kyon_mid
with dissolve
voice "阿虚_sheet1_row12_synthesized.wav"
role1 "游戏？难不成要找隔壁电研部…"
hide kyon 0021
show haruhi 0589 at haruhi_mid
with dissolve
voice "凉宫春日_sheet1_row13_synthesized.wav"
role2 "不用，就我们自己做。"
hide haruhi 0589
show kyon 0039 at kyon_mid
with dissolve
voice "阿虚_sheet1_row14_synthesized.wav"
role1 "我们自己？别开玩笑了，我们五个除了长门哪有人会编程啊？"
hide kyon 0039
show haruhi 0593 at haruhi_mid
with dissolve
voice "凉宫春日_sheet1_row15_synthesized.wav"
role2 "不用哦，我借到了一个超方便的软件。"
hide haruhi 0593
voice "凉宫春日_sheet1_row16_synthesized.wav"
role2 "还有，不是五个人，屏幕前的各位也来一起帮忙吧。"
voice "凉宫春日_sheet1_row17_synthesized.wav"
role2 "不需要学习复杂的内容，只要把想做的东西放进去，就能砰地一下变出游戏哦！"
show haruhi 0903 at haruhi_mid
with dissolve
voice "凉宫春日_sheet1_row18_synthesized.wav"
role2 "准备好了吗？那么要开始了哦！"
hide haruhi 0903
voice "阿虚_sheet1_row19_synthesized.wav"
role1 "嗯？你在跟谁说话？喂？有人在听吗？"
