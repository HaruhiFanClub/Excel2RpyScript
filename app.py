#!/usr/bin/env python
#-*- coding:utf-8 -*-
import base64
from io import BytesIO
from tkinter import Tk, Text, PhotoImage, Canvas
from tkinter.messagebox import showerror, showinfo
from tkinter.ttk import Frame, Style, Entry, Combobox, Button, Label
from tkinter import filedialog
from corelib.exception import ConvertException, SaveFileException
from handler.converter import Converter
from tools.image_data import *


class Application_ui(Frame):
    #这个类仅实现界面生成功能，具体事件处理代码在子类Application中。

    def __init__(self, master=None):
        Frame.__init__(self, master)
        self.master.title('Excel转化Rpy工具')
        self.master.geometry('600x343')
        self.createWidgets()

    def createWidgets(self):
        self.top = self.winfo_toplevel()

        self.style = Style()
        self.bkg_gif = PhotoImage(data=base64.b64decode(back_ground_gif_data))
        self.background_label = Label(self.top, image=self.bkg_gif)
        self.background_label.place(x=0, y=0, relwidth=1, relheight=1)

        self.Text = Text(self.top, font=('宋体',9))
        self.Text.place(relx=0.066, rely=0.07, relwidth=0.869, relheight=0.563)

        self.saveAddr = Entry(self.top, font=('宋体',9))
        self.saveAddr.place(relx=0.355, rely=0.84, relwidth=0.409, relheight=0.052)

        self.ComboList = ['源文件目录','自定义目录']
        self.Combo = Combobox(self.top, values=self.ComboList, font=('宋体',9), state='readonly')
        self.Combo.place(relx=0.184, rely=0.84, relwidth=0.146, relheight=0.058)
        self.Combo.set(self.ComboList[0])
        self.Combo.bind('<<ComboboxSelected>>', self.comboEvent)

        self.style.configure('InputButton.TButton',font=('宋体',9))
        self.InputButton = Button(self.top, text='浏览', command=self.InputButton_Cmd, style='InputButton.TButton')
        self.InputButton.place(relx=0.184, rely=0.7, relwidth=0.133, relheight=0.073)

        self.Haruhi_gif = PhotoImage(data=base64.b64decode(haruhi_gif_data))
        self.style.configure('ConvertButton.TButton',font=('宋体',9))
        self.ConvertButton = Button(self.top, image=self.Haruhi_gif, command=self.ConvertButton_Cmd, style='ConvertButton.TButton')
        self.ConvertButton.place(relx=0.788, rely=0.7, relwidth=0.146, relheight=0.236)

        self.style.configure('OutputLabel.TLabel',anchor='w', font=('宋体',9))
        self.OutputLabel = Label(self.top, text='保存目录：', style='OutputLabel.TLabel')
        self.OutputLabel.place(relx=0.066, rely=0.84, relwidth=0.107, relheight=0.05)

        self.style.configure('InputLabel.TLabel',anchor='w', font=('宋体',9))
        self.InputLabel = Label(self.top, text='输入设置：', style='InputLabel.TLabel')
        self.InputLabel.place(relx=0.066, rely=0.723, relwidth=0.107, relheight=0.05)


class Application(Application_ui):
    #这个类实现具体的事件处理回调函数。界面生成代码在Application_ui中。

    def __init__(self, master=None):
        Application_ui.__init__(self, master)

    def convert(self, input_path, output_path, texts, c):
            try:
                with open(output_path, 'w', encoding='utf-8') as f:
                    for k, v in c.role_name_mapping.items():
                        f.write(v.render() + "\n")
                    f.write("define narrator_nvl = Character(None, kind=nvl)\n")
                    f.write("define narrator_adv = Character(None, kind=adv)\n")
                    f.write("\nlabel start:\n")
                    for text in texts:
                        for t in text.triggers:
                            f.write(" "*4 + t.render() + "\n")
                        f.write((" "*4 + text.render() + "\n"))
            except FileNotFoundError:
                raise SaveFileException("保存目录不存在")

    def checkEqual(self, iterator):
        iterator = iter(iterator)
        try:
            first = next(iterator)
        except StopIteration:
            return False
        return all(first == rest for rest in iterator)

    def getFileName(self, path):
        return path.split('/')[-1].split('.')[0]

    def getTlist(self):
        Tlist=self.Text.get('1.0', 'end').split('\n')
        Tlist=[value.strip() for value in Tlist]
        Tlist=[value for value in Tlist if value]
        return Tlist

    def getOriPath(self):
        paths=list()
        for path in self.getTlist():
            paths.append('/'.join(path.split('/')[0:-1]))
        if self.checkEqual(paths):
            return paths[0]
        else:
            showerror("获取错误", "未设置输入或源文件不在同一目录下！")
            return ''

    def comboEvent(self, *arg):
        if self.Combo.get()=='源文件目录':
            if self.saveAddr.get(): self.saveAddr.delete('0','end')
            self.saveAddr.insert('0',self.getOriPath())
        elif self.Combo.get()=='自定义目录':
            file_path = filedialog.askdirectory(title=u'保存文件到文件夹')
            if self.saveAddr.get(): self.saveAddr.delete('0','end')
            self.saveAddr.insert('0',file_path)

    def InputButton_Cmd(self, event=None):
        file_paths = filedialog.askopenfilenames(title=u'选择文件', filetypes=[("Excel-2007 file", "*.xlsx"),("Excel-2003 file", "*.xls"),("all","*.*")])
        #print('打开文件：', file_paths)
        for line in file_paths:
            self.Text.insert('0.0',line+'\n')
        self.comboEvent()

    def ConvertButton_Cmd(self, event=None):
        success_flag = True
        for path in self.getTlist():
            try: 
                c = Converter(path)
                texts = c.generate_rpy_elements()
                cnt = len(texts)
                for i in range(cnt):
                    self.convert(path, self.saveAddr.get()+'/'+self.getFileName(path)+'_'+(str)(i+1)+'.rpy', texts[i], c)
            except ConvertException as err:
                success_flag = False
                showerror("转换错误", err.msg)
        if success_flag:
            showinfo("转换成功", "转换完成")
            self.saveAddr.delete('0','end')
            self.Text.delete('0.0','end')
            
if __name__ == "__main__":
    top = Tk()
    # top.iconbitmap('sos.ico')
    top.iconphoto(False, PhotoImage(data=base64.b64decode(haruhi_gif_data)))
    Application(top).mainloop()
    try: top.destroy()
    except: pass
