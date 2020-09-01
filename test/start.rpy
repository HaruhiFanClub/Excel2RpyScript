define role1 = Character('春日', color="#c8c8ff")
define role2 = Character('阿虚', color="#c8c8ff")
define narrator_nvl = Character(None, kind=nvl)
define narrator_adv = Character(None, kind=adv)
define config.voice_filename_format = "audio/{filename}"

label start:
play music "audio/19.mp3"
show haruhi 1 at left
show kyon 1 at right
scene bg34
with dissolve
narrator_nvl "\"喂，你们知道肾上腺素这种东西吗？\""
voice "test"
narrator_nvl "\"没错，就是那种当人遭遇某种突如其来的刺激时才会分泌，可以使人呼吸加快、心跳加速、瞳孔放大，激发身体潜能好应对可能发生的事情的那种激素。\""
narrator_nvl "\"如果现在我的身上有那么一个用来测量这种激素浓度的仪器，那么上面的数字恐怕一定是在不断地飙升的吧——\""
nvl clear
narrator_nvl "\"什么？你问我怎么知道？\""
narrator_nvl "\"因为现在的我正带着着自己越来越沉重的呼吸，在心脏以超常速度泵出来的血液和随着时间的推进而不断绷紧的神经的伴随下，\n和那个名叫凉宫春日的女人缓慢地穿行在空旷且黑暗的隧道里。 \""
stop music
play sound "audio/zou_lu_1.mp3" loop
narrator_nvl "\"不错，到目前为止我和春日已经沿着隧道壁走了半个小时， 但仍没有一点要找到出口的迹象。\""
play music "audio/19.mp3"
hide haruhi 1
hide kyon 1
show haruhi 1 at left
show kyon 5 at center
with dissolve
narrator_nvl "\"包裹在右手上的外套一直摩擦着粗糙的岩壁，回音在隧道里相互叠加不断传递 ，最终汇聚成了一股丝毫都不悦耳、反而让人愈加烦躁的声音。 \""
narrator_nvl "\"如果这是一个恐怖游戏的关卡，那么我一定要提名它拿今年科隆游戏展的最佳恐怖游戏配音奖——如果有这个奖项的话。\""
play music "audio/20.mp3"
voice "test"
narrator_nvl "\"就在我试图用一些轻松一点的想法冲淡自己的紧张，尽量不让自己在逃出去之前就被自己的肾上腺素毒死之时，我那紧紧握着春日右手的左手，又一次感受到了来自春日那微微地握力。 \""
voice sustain
narrator_nvl "\"不仅是我，就连平日里元气十足、坐镇北高文学部部室四处征伐的团长大人，此刻也通过手心里微微渗出的汗滴来委婉地告诉我她的不安。\""
narrator_nvl "\"而这时不时传来的、看似微弱但却异常敏感的身体信号，则更是从频率上在暗示着她和我一样不断加重的负面情绪。\""
narrator_nvl "\"从刚刚开始，我们就一直拉着手——像是在孤岛那会儿一样，只不过这次面对的，似乎是更加未知的前景。\""
narrator_nvl "\"我对春日报以相同的回应，也握了握她的手。\""
narrator_nvl "\"老实说，我并不怀疑春日这难得的、稳扎稳打的脱险方法，更坚信走出去只是迟早的事情——但不知为什么，不安和焦虑，却顽固地笼罩在我心里这个看似光明的信念上，挥之不去。\""
stop music
hide haruhi 1
hide kyon 5
show haruhi 3 at left
show kyon 5 at center
stop music
role1 "\"啊！ \""
hide haruhi 3
hide kyon 5
show haruhi 3 at left
show kyon 4 at center
narrator_adv "\"正在我不断地想要用一些较为轻松的想法，在一众消极因素里解救出自己的积极心态时，春日突然发出的叫声，把我的思维拉回了阴暗空旷的隧道里。\""
narrator_adv "\"她的身子迅速地向前扑去，左手也离开了岩壁，挥舞到了半空中——很明显是失去了平衡的缘故，并且由于和我紧握双手的关系，几乎把我也拉到了摔倒的境地。 \""
with Fade(0.1,0.0,0.5,color="#FFFFFF")
narrator_adv "\"我急忙把身体往后倾斜，并借助着右手触碰到的一块突起的岩石，在体重、地心引力和惯性的共同作用下，才勉强把她拉了起来，避免了她磕在隧道的某个地方。\""
play music "audio/22.mp3"
hide haruhi 3
hide kyon 4
show haruhi 1 at left
show kyon 4 at center
with dissolve
role2 "\"你没事吧？！春日。 \""
hide haruhi 1
hide kyon 4
show haruhi 2 at center
narrator_adv "\"借着手机屏幕的亮光，我勉强看清了她的表情——涨红了脸，流露出一股由惊慌、不满和似乎是害羞的情绪所组成的复杂表情。看样子她也快到极限了。 \""
hide haruhi 2
show haruhi 6 at center
role1 "\"没，没事。\""
hide haruhi 6
hide haruhi 1
role1 "\"只是不小心被石头绊了一下，想不到竟然差点摔了下去。\""
