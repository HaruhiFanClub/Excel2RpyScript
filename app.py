#!/usr/bin/env python
# -*- coding:utf-8 -*-
import base64
import webbrowser
from tkinter import Tk, Text, PhotoImage, Menu, messagebox, END
from tkinter.messagebox import showerror, showinfo
from tkinter.ttk import Frame, Style, Entry, Combobox, Button, Label
from tkinter import filedialog
from tkinter.ttk import Notebook
from tkinter import Listbox, END
from tkinter import simpledialog

import requests


from const.tts_setting import TTSConfig
from const import CURRENT_VERSION
from corelib.exception import ConvertException, SaveFileException, VoiceException
from handler.converter import Converter
from handler.parser import Parser
from handler.writer import RpyFileWriter
from tools.image_data import *
from handler.tts import TTS



class Application_ui(Frame):
    # 这个类仅实现界面生成功能，具体事件处理代码在子类Application中。

    def __init__(self, master=None):
        Frame.__init__(self, master)
        self.master.title('Excel转化Rpy工具')
        self.master.geometry('1280x720')
        self.style = Style()
        self.style.configure('TLabel', font=('宋体', 12))
        self.style.configure('TButton', font=('宋体', 12))
        tts_config = TTSConfig()
        self.role_model_mapping = tts_config.role_model_mapping
        self.API_BASE_URL = tts_config.api_base_url
        self.voice_cmd_mapping = tts_config.voice_cmd_mapping
        self.default_prompt_text = tts_config.default_prompt_text
        self.default_prompt_audio = tts_config.default_prompt_audio
        self.deepL_api_key = tts_config.deepL_api_key
        self.save_config_gui = tts_config.save_config_gui
        self.delete_role_gui = tts_config.delete_role
        self.delete_voice_cmd_gui = tts_config.delete_voice_cmd
        self.last_selected_role = None
        self.last_selected_cmd = None
        self.createWidgets()

    def createWidgets(self):
        self.top = self.winfo_toplevel()
        self.bkg_gif = PhotoImage(data=base64.b64decode(back_ground_gif_data))
        self.background_label = Label(self.top, image=self.bkg_gif)
        self.background_label.place(x=0, y=0, relwidth=1, relheight=1)

        # 创建 Notebook 以支持多个标签页
        self.notebook = Notebook(self.top)
        self.notebook.pack(fill='both', expand=True)
        
        # 创建主功能标签页
        self.main_tab = Frame(self.notebook)
        self.notebook.add(self.main_tab, text='主功能')
        self.createMainWidgets()
        
        # 创建配置标签页
        self.config_tab = Frame(self.notebook)
        self.notebook.add(self.config_tab, text='配置项')
        self.createConfigWidgets()


        
    def createConfigWidgets(self):
        # 角色列表
        self.role_listbox = Listbox(self.config_tab, height=10, width=30)
        self.role_listbox.place(relx=0.05, rely=0.05, relwidth=0.13, relheight=0.25)
        self.role_listbox.bind('<<ListboxSelect>>', self.update_model_paths)

        for role in self.role_model_mapping.keys():
            self.role_listbox.insert(END, role)

        

        self.gpt_label = Label(self.config_tab, text='GPT 模型路径:', style='TLabel')
        self.gpt_label.place(relx=0.20, rely=0.05, relwidth=0.2, relheight=0.05)
        self.gpt_entry = Entry(self.config_tab)
        self.gpt_entry.place(relx=0.32, rely=0.05, relwidth=0.4, relheight=0.05)
        self.gpt_entry.insert(0, "选择角色并键入模型路径")

        self.sovits_label = Label(self.config_tab, text='SoVITS 模型路径:', style='TLabel')
        self.sovits_label.place(relx=0.20, rely=0.1, relwidth=0.2, relheight=0.05)
        self.sovits_entry = Entry(self.config_tab)
        self.sovits_entry.place(relx=0.32, rely=0.1, relwidth=0.4, relheight=0.05)
        self.sovits_entry.insert(0, "选择角色并键入模型路径")

        # 语音指令列表
        self.voice_cmd_listbox = Listbox(self.config_tab, height=10, width=30)
        self.voice_cmd_listbox.place(relx=0.05, rely=0.35, relwidth=0.13, relheight=0.25)
        self.voice_cmd_listbox.bind('<<ListboxSelect>>', self.update_voice_cmd_params)

        for cmd in self.voice_cmd_mapping.keys():
            self.voice_cmd_listbox.insert(END, cmd)

        self.ref_audio_label = Label(self.config_tab, text='参考音频路径:', style='TLabel')
        self.ref_audio_label.place(relx=0.20, rely=0.35, relwidth=0.2, relheight=0.05)
        self.ref_audio_entry = Entry(self.config_tab)
        self.ref_audio_entry.place(relx=0.32, rely=0.35, relwidth=0.4, relheight=0.05)
        self.ref_audio_entry.insert(0, "选择命令并键入参考音频路径")

        self.prompt_text_label = Label(self.config_tab, text='提示文本:', style='TLabel')
        self.prompt_text_label.place(relx=0.20, rely=0.40, relwidth=0.2, relheight=0.05)
        self.prompt_text_entry = Entry(self.config_tab)
        self.prompt_text_entry.place(relx=0.32, rely=0.40, relwidth=0.4, relheight=0.05)
        self.prompt_text_entry.insert(0, "选择命令并键入参考音频文本")

        # 保存配置按钮
        self.save_config_button = Button(self.config_tab, text='保存配置', command=self.save_config_try, style='TButton')
        self.save_config_button.place(relx=0.75, rely=0.05, relwidth=0.15, relheight=0.25)

        # 新增、删除角色按钮
        self.add_role_button = Button(self.config_tab, text='新增角色', command=self.add_role)
        self.add_role_button.place(relx=0.20, rely=0.20, relwidth=0.1, relheight=0.05)

        self.delete_role_button = Button(self.config_tab, text='删除角色', command=self.delete_role)
        self.delete_role_button.place(relx=0.32, rely=0.20, relwidth=0.1, relheight=0.05)

        # 新增、删除语音指令按钮
        self.add_voice_cmd_button = Button(self.config_tab, text='新增指令', command=self.add_voice_cmd)
        self.add_voice_cmd_button.place(relx=0.20, rely=0.50, relwidth=0.1, relheight=0.05)

        self.delete_voice_cmd_button = Button(self.config_tab, text='删除指令', command=self.delete_voice_cmd)
        self.delete_voice_cmd_button.place(relx=0.32, rely=0.50, relwidth=0.1, relheight=0.05)

        self.default_audio_label = Label(self.config_tab, text='默认参考音频:', style='TLabel')
        self.default_audio_label.place(relx=0.20, rely=0.65, relwidth=0.2, relheight=0.05)
        self.default_audio_entry = Entry(self.config_tab)
        self.default_audio_entry.place(relx=0.32, rely=0.65, relwidth=0.4, relheight=0.05)
        self.default_audio_entry.insert(0, self.default_prompt_audio)

        self.default_text_label = Label(self.config_tab, text='默认文本:', style='TLabel')
        self.default_text_label.place(relx=0.20, rely=0.7, relwidth=0.2, relheight=0.05)
        self.default_text_entry = Entry(self.config_tab)
        self.default_text_entry.place(relx=0.32, rely=0.7, relwidth=0.4, relheight=0.05)
        self.default_text_entry.insert(0, self.default_prompt_text)

        # API 基础 URL
        self.api_base_label = Label(self.config_tab, text='API 基础 URL:', style='TLabel')
        self.api_base_label.place(relx=0.20, rely=0.75, relwidth=0.2, relheight=0.05)
        self.api_base_entry = Entry(self.config_tab)
        self.api_base_entry.place(relx=0.32, rely=0.75, relwidth=0.4, relheight=0.05)
        self.api_base_entry.insert(0, self.API_BASE_URL['base'])
        
        self.deepL_api_label = Label(self.config_tab, text='DeepL API_KEY:', style='TLabel')
        self.deepL_api_label.place(relx=0.20, rely=0.80, relwidth=0.2, relheight=0.05)
        self.deepL_api_entry = Entry(self.config_tab)
        self.deepL_api_entry.place(relx=0.32, rely=0.80, relwidth=0.4, relheight=0.05)
        self.deepL_api_entry.insert(0, self.deepL_api_key)

    def save_config_try(self):
        
        self.default_prompt_audio = self.default_audio_entry.get()
        self.default_prompt_text = self.default_text_entry.get()
        self.api_base_url = {'base': self.api_base_entry.get()}
        self.deepL_api_key = self.deepL_api_entry.get()
        
        # 更新角色模型映射
        if self.last_selected_role:
            self.role_model_mapping[self.last_selected_role] = {
                'gpt': self.gpt_entry.get(),
                'sovits': self.sovits_entry.get()
            }
        # 更新语音指令映射
        if self.last_selected_cmd:
            self.voice_cmd_mapping[self.last_selected_cmd] = {
                'ref_audio_path': self.ref_audio_entry.get(),
                'prompt_text':self.prompt_text_entry.get()
            }

        self.save_config_gui(self.default_prompt_text, self.default_prompt_audio, self.api_base_url, self.role_model_mapping, self.voice_cmd_mapping, self.deepL_api_key)

    def add_role(self):
        new_role = simpledialog.askstring("新增角色", "请输入角色名:")
        if new_role and new_role not in self.role_model_mapping:
            self.role_model_mapping[new_role] = {"gpt": "", "sovits": ""}
            self.role_listbox.insert(END, new_role)

    def delete_role(self):
        selected_index = self.role_listbox.curselection()
        if selected_index:
            selected_role = self.role_listbox.get(selected_index)
            self.delete_role_gui(selected_role)
            self.role_listbox.delete(selected_index)
            self.gpt_entry.delete(0, END)
            self.sovits_entry.delete(0, END)

    def add_voice_cmd(self):
        new_cmd = simpledialog.askstring("新增指令", "请输入指令名:")
        if new_cmd and new_cmd not in self.voice_cmd_mapping:
            self.voice_cmd_mapping[new_cmd] = {"ref_audio_path": "", "prompt_text": ""}
            self.voice_cmd_listbox.insert(END, new_cmd)

    def delete_voice_cmd(self):
        selected_index = self.voice_cmd_listbox.curselection()
        if selected_index:
            selected_cmd = self.voice_cmd_listbox.get(selected_index)
            self.delete_voice_cmd_gui(selected_cmd)
            self.voice_cmd_listbox.delete(selected_index)
            self.ref_audio_entry.delete(0, END)
            self.prompt_text_entry.delete(0, END)

    def update_model_paths(self, event):
        selected_index = self.role_listbox.curselection()
        if selected_index:
            self.last_selected_role = self.role_listbox.get(selected_index)
            gpt = self.role_model_mapping[self.last_selected_role].get('gpt', '')
            sovits = self.role_model_mapping[self.last_selected_role].get('sovits', '')
            
            self.gpt_entry.delete(0, END)
            self.gpt_entry.insert(0, gpt)
            self.sovits_entry.delete(0, END)
            self.sovits_entry.insert(0, sovits)

    def update_voice_cmd_params(self, event):
        selected_index = self.voice_cmd_listbox.curselection()
        if selected_index:
            self.last_selected_cmd = self.voice_cmd_listbox.get(selected_index)
            ref_audio_path = self.voice_cmd_mapping[self.last_selected_cmd].get('ref_audio_path', '')
            prompt_text = self.voice_cmd_mapping[self.last_selected_cmd].get('prompt_text', '')
            
            self.ref_audio_entry.delete(0, END)
            self.ref_audio_entry.insert(0, ref_audio_path)
            self.prompt_text_entry.delete(0, END)
            self.prompt_text_entry.insert(0, prompt_text)

    def createMainWidgets(self):
        self.Text = Text(self.main_tab, font=('宋体', 12))
        self.Text.place(relx=0.066, rely=0.07, relwidth=0.869, relheight=0.563)

        self.saveAddr = Entry(self.main_tab, font=('宋体', 12))
        self.saveAddr.place(relx=0.355, rely=0.84, relwidth=0.409, relheight=0.052)

        self.ComboList = ['源文件目录', '自定义目录']
        self.Combo = Combobox(self.main_tab, values=self.ComboList, font=('宋体', 12), state='readonly')
        self.Combo.place(relx=0.184, rely=0.84, relwidth=0.146, relheight=0.058)
        self.Combo.set(self.ComboList[0])
        self.Combo.bind('<<ComboboxSelected>>', self.comboEvent)

        self.style.configure('InputButton.TButton', font=('宋体', 12))
        self.InputButton = Button(self.main_tab, text='浏览', command=self.InputButton_Cmd, style='InputButton.TButton')
        self.InputButton.place(relx=0.184, rely=0.7, relwidth=0.133, relheight=0.073)

        self.Haruhi_gif = PhotoImage(data=base64.b64decode(haruhi_gif_data))
        self.style.configure('ConvertButton.TButton', font=('宋体', 12))
        self.ConvertButton = Button(self.main_tab, image=self.Haruhi_gif, command=self.ConvertButton_Cmd,
                                    style='ConvertButton.TButton')
        self.ConvertButton.place(relx=0.788, rely=0.7, relwidth=0.146, relheight=0.236)

        self.style.configure('SynthesizeButton.TButton', font=('宋体', 12))
        self.SynthesizeButton = Button(self.main_tab, text='按源语言合成音频', command=self.synthesize_audio, style='SynthesizeButton.TButton')
        self.SynthesizeButton.place(relx=0.35, rely=0.7, relwidth=0.180, relheight=0.073)

        self.style.configure('SynthesizeJapaneseButton.TButton', font=('宋体', 12))
        self.SynthesizeJapaneseButton = Button(self.main_tab, text='按中译日合成音频', command=self.synthesize_japanese_audio, style='SynthesizeJapaneseButton.TButton')
        self.SynthesizeJapaneseButton.place(relx=0.55, rely=0.7, relwidth=0.180, relheight=0.073)

        self.style.configure('OutputLabel.TLabel', anchor='w', font=('宋体', 12))
        self.OutputLabel = Label(self.main_tab, text='保存目录：', style='OutputLabel.TLabel')
        self.OutputLabel.place(relx=0.066, rely=0.84, relwidth=0.107, relheight=0.05)

        self.style.configure('InputLabel.TLabel', anchor='w', font=('宋体', 12))
        self.InputLabel = Label(self.main_tab, text='输入设置：', style='InputLabel.TLabel')
        self.InputLabel.place(relx=0.066, rely=0.723, relwidth=0.107, relheight=0.05)

        menubar = Menu(self.top)
        filemenu = Menu(menubar, tearoff=0)  # tearoff意为下拉
        menubar.add_cascade(label='帮助', menu=filemenu)
        filemenu.add_command(label='视频教程', command=self.open_help_url)
        filemenu.add_command(label='检查更新', command=self.check_for_update)

        self.top.config(menu=menubar)
        
        

class Application(Application_ui):
    # 这个类实现具体的事件处理回调函数。界面生成代码在Application_ui中。

    def __init__(self, master=None):
        Application_ui.__init__(self, master)

    def convert(self, output_dir, res, role_name_mapping, role_side_character_mapping):
        try:
            RpyFileWriter.write_file(output_dir, res, role_name_mapping, role_side_character_mapping)
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
        Tlist = self.Text.get('1.0', 'end').split('\n')
        Tlist = [value.strip() for value in Tlist]
        Tlist = [value for value in Tlist if value]
        return Tlist

    def getOriPath(self):
        paths = list()
        for path in self.getTlist():
            paths.append('/'.join(path.split('/')[0:-1]))
        if self.checkEqual(paths):
            return paths[0]
        else:
            showerror("获取错误", "未设置输入或源文件不在同一目录下！")
            return ''

    def comboEvent(self, *arg):
        if self.Combo.get() == '源文件目录':
            if self.saveAddr.get():
                self.saveAddr.delete('0', 'end')
            self.saveAddr.insert('0', self.getOriPath())
        elif self.Combo.get() == '自定义目录':
            file_path = filedialog.askdirectory(title=u'保存文件到文件夹')
            if self.saveAddr.get():
                self.saveAddr.delete('0', 'end')
            self.saveAddr.insert('0', file_path)

    def InputButton_Cmd(self, event=None):
        file_paths = filedialog.askopenfilenames(title=u'选择文件',
                                                 filetypes=[("Excel-2007 file", "*.xlsx"), ("Excel-2003 file", "*.xls"),
                                                            ("all", "*.*")])
        for line in file_paths:
            self.Text.insert(END, line + '\n')
        self.comboEvent()

    def ConvertButton_Cmd(self, event=None):
        success_flag = True
        for path in self.getTlist():
            try:
                parser = Parser(path)
                conveter = Converter(parser)
                convert_results = conveter.generate_rpy_elements()
                
                print(conveter.side_characters)
                for res in convert_results:
                    self.convert(self.saveAddr.get(), res, conveter.role_name_mapping, conveter.side_characters)
            except ConvertException as err:
                success_flag = False
                showerror("转换错误", err.msg)
        if success_flag:
            showinfo("转换成功", "转换完成")
            self.saveAddr.delete('0', 'end')
            self.Text.delete('0.0', 'end')

    def synthesize_audio(self, event=None):
        success_flag = True
        for path in self.getTlist():
            try:
                parser = Parser(path)
                conveter = Converter(parser)
                convert_results = conveter.generate_rpy_elements()
                tts = TTS(conveter)
                parsed_sheets_tts = tts.filter_parsed_sheets_tts()
                tts.synthesize_voice(parsed_sheets_tts,'ZH')
            except VoiceException as err:
                success_flag = False
                showerror("合成错误", err.msg)    
            if success_flag:
                showinfo("合成成功", "合成完成")
                self.saveAddr.delete('0', 'end')
                self.Text.delete('0.0', 'end')
                
    def synthesize_japanese_audio(self, event=None):
        success_flag = True
        for path in self.getTlist():
            try:
                parser = Parser(path)
                conveter = Converter(parser)
                convert_results = conveter.generate_rpy_elements()
                tts = TTS(conveter)
                parsed_sheets_tts = tts.filter_parsed_sheets_tts()
                tts.synthesize_voice(parsed_sheets_tts,'JA')
            except VoiceException as err:
                success_flag = False
                showerror("合成错误", err.msg)    
            if success_flag:
                showinfo("合成成功", "合成完成")
                self.saveAddr.delete('0', 'end')
                self.Text.delete('0.0', 'end')  
    
    def open_url(self, url):
        webbrowser.open(url, new=0)

    def open_help_url(self, event=None):
        self.open_url("https://www.bilibili.com/video/BV1gZ4y1K7Y9")

    def check_for_update(self, event=None):
        try:
            resp = requests.get("https://api.github.com/repos/HaruhiFanClub/Excel2RpyScript/releases/latest", timeout=2).json()
        except Exception as ex:
            self.Text.insert(END, "检查更新失败：{}\n请直接到https://github.com/HaruhiFanClub/Excel2RpyScript/releases查看最新版本\n")
            showinfo("网络连接失败", "\n检查新版本信息失败!\n".format(ex))
            return
        if resp['tag_name'] == CURRENT_VERSION:
            showinfo("检测成功", "当前已经是最新版本!")
        else:
            confirm_download = self.showConfirmModal("检查到新版本", "当前版本：{0}  最新版本：{1}, 是否前往{2}下载？"
                                                     .format(CURRENT_VERSION, resp['tag_name'], resp['html_url']))
            if confirm_download:
                self.open_url(resp['html_url'])

    def showConfirmModal(self, title, message):
        return messagebox.askokcancel(title, message)


if __name__ == "__main__":
    top = Tk()
    top.iconphoto(False, PhotoImage(data=base64.b64decode(haruhi_gif_data)))
    Application(top).mainloop()
    try:
        top.destroy()
    except:
        pass
