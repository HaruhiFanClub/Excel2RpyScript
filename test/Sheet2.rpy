define role1 = Character('长门', color="#c8c8ff", image="role1")
define role2 = Character('阿虚', color="#c8c8ff", image="role2")
define role3 = Character('春日', color="#c8c8ff", image="role3")
define narrator_nvl = Character(None, kind=nvl)
define narrator_adv = Character(None, kind=adv)
define config.voice_filename_format = "audio/{filename}"

label Sheet2:
scene bg02
with dissolve
with dissolve
stop music
hide yuki 1
show haruhi 3 at left
show kyon 5 at center
stop music
hide haruhi 3
hide kyon 5
show haruhi 3 at left
show kyon 4 at center
with Fade(0.1,0.0,0.5,color="#FFFFFF")
play music "audio/22.mp3"
hide haruhi 3
hide kyon 4
show haruhi 1 at left
show kyon 4 at center
with dissolve
hide haruhi 1
hide kyon 4
show haruhi 2 at center
hide haruhi 2
show haruhi 6 at center
hide haruhi 6
hide haruhi 1
