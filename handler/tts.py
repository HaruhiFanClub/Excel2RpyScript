from collections import namedtuple

from const.converter_setting import ElementColNumMapping, PositionMapping, ImageCmdMapping, TransitionMapping, \
    ReplaceCharacterMapping
    
from const.tts_setting import role_model_mapping, API_BASE_URL, voice_cmd_mapping, default_prompt_audio, default_prompt_text

import requests, os

class TTS(object):
    def __init__(self,conveter):
        self.conveter = conveter
        self.parser = conveter.parser
        self.last_role_name = None
        
    def filter_parsed_sheets_tts(self):
        parsed_sheets = self.parser.get_parsed_sheets()
        parsed_sheets_tts = []
        
        current_role_name = None  # 用于跟踪最近的有效 role_name

        for parsed_sheet in parsed_sheets:
            filtered_rows = []
            for row in parsed_sheet.row_values:
                # 检查当前行的 role_name
                role_name = row[ElementColNumMapping.get('role_name')]
                if role_name.strip():
                    current_role_name = role_name  # 更新最近的有效 role_name
                else:
                    role_name = current_role_name  # 如果当前 role_name 为空，使用最近的有效值
                
                if row[ElementColNumMapping.get('voice')].strip().lower() == 'tts':
                    # 只保留 role_name, text, 和 voice_cmd 列
                    filtered_row = {
                        'role_name': role_name,
                        'text': row[ElementColNumMapping.get('text')],
                        'voice_cmd': row[ElementColNumMapping.get('voice_cmd')]
                    }
                    filtered_rows.append(filtered_row)
                    
            filtered_rows.sort(key=lambda x: x['role_name'])
            
            if filtered_rows:
                parsed_sheets_tts.append({
                    'name': parsed_sheet.name,
                    'rows': filtered_rows
                })

        return parsed_sheets_tts


    def switch_models(self, role_name):
        
        # 切换到对应的GPT和SoVITS模型
        
        if role_name == self.last_role_name:
            return  # 如果角色名相同，则无需切换
        
        models = role_model_mapping.get(role_name)
        
        if models:
            gpt_model = models['gpt']
            sovits_model = models['sovits']

            # 切换到对应的GPT模型
            requests.get(f"{API_BASE_URL['base']}set_gpt_weights?weights_path={gpt_model}")

            # 切换到对应的SoVITS模型
            requests.get(f"{API_BASE_URL['base']}set_sovits_weights?weights_path={sovits_model}")

            self.last_role_name = role_name  # 更新上一个角色名
        else:
            print(f"No model found for role: {role_name}")
            
    def translate_text(self, text, target_lang):
        # DeepL API翻译方法
        api_url = "https://api-free.deepl.com/v2/translate"
        params = {
            "auth_key": "a3db6896-b41d-460a-bdbd-402d53c9eadc:fx",  # 替换为你的API密钥
            "text": text,
            "target_lang": target_lang,
        }
        response = requests.post(api_url, data=params)
        if response.status_code == 200:
            return response.json()['translations'][0]['text']
        else:
            print(f"Translation error: {response.json()}")
            return text  # 返回原文本以防止错误中断
    
        
    def synthesize_voice(self,voice_tts_sheets,language):
        for sheet_index, sheet in enumerate(voice_tts_sheets):
            for row_index, row in enumerate(sheet['rows']):
                role_name = row['role_name']  # 获取角色名
                text = row['text']  # 获取文本
                voice_cmd = row['voice_cmd']  # 获取语音指令
                
                # 获取对应的 ref_audio_path 和 prompt_text
                audio_params = voice_cmd_mapping.get(voice_cmd, {})
                ref_audio_path = audio_params.get("ref_audio_path", f"{default_prompt_audio}")  # 默认值
                prompt_text = audio_params.get("prompt_text", f"{default_prompt_text}")  # 默认值

                # 使用DeepL翻译中文文本为日文
                if language == 'JA':
                    text = self.translate_text(text, target_lang='JA')

                self.switch_models(role_name)
                
                # 发送合成请求
                response = requests.post(
                    f"{API_BASE_URL['base']}tts",
                    json={
                        "text": text,
                        "text_lang": "auto",
                        "ref_audio_path": ref_audio_path,  # 参考音频路径
                        "prompt_text": prompt_text,  # 参考音频文本
                        "prompt_lang": "auto",
                        "text_split_method": "cut0",  # 可选的文本分割方法
                        "batch_size": 1,  # 每次请求一行
                    }
                )
                # 确保audio文件夹存在
                audio_folder = "audio"
                os.makedirs(audio_folder, exist_ok=True)
                # 处理响应
                if response.status_code == 200:
                    # 处理成功的音频流
                    audio_stream = response.content
                    audio_file_path = os.path.join(audio_folder, f"{role_name}_sheet{sheet_index+1}_row{row_index+8}_synthesized.wav")
                    with open(audio_file_path, "wb") as f:
                        f.write(audio_stream)
                else:
                    print(f"Error for {role_name}: {response.json()}")

            