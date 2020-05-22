# encoding: utf-8

"""
    程序入口
"""
from model.element import Text,Character,Image,Transition
from handler.render import Render
from model.process import Menu,Label,Jump,Pause
if __name__ == '__main__':
    label_start=Label("start")
    bg_meadow=Image("bg meadow","scene")
    bg_meadow_transition=Transition("fade")
    mycharacter=Character("m","我","image_for_what?","#c8ffc8")
    mytext=Text("嗨……唔……","m")
    sylvie_green_smile=Image("sylvie green smile","show")
    sylvie_green_smile_transition=Transition("dissolve")
    mypause=Pause()

    mylist=[label_start,bg_meadow,bg_meadow_transition,mycharacter,mytext,sylvie_green_smile,sylvie_green_smile_transition,mypause]
    myrenderer=Render(mylist)
    output_list=myrenderer.render()
    for each_line in output_list:
        print(each_line)
