import json
import os

class TTSConfig:
    def __init__(self, config_file='config.json'):
        self.config_file = config_file
        self.role_model_mapping = {
            "长门有希": {
                "gpt": "GPT_weights_v2/nagato_yuki-e15.ckpt",
                "sovits": "SoVITS_weights_v2/nagato_yuki_e15_s2160.pth"
            },
            "your_first_character": {
                "gpt": "角色名应与你在表格中填写的角色名相同，熟悉后请新建角色使用",
                "sovits": "如果你在本地运行API，请填写本地模型位置，否则请咨询在线服务的提供者"
            },
            # 添加更多角色...
        }
        self.voice_cmd_mapping = {
            "voice_cmd_1": {
                "ref_audio_path": "仅当你使用表格中的语音指令列时，才需要用到此项",
                "prompt_text": "否则仅需配置默认参考音频及文本便可"
            },
            "voice_cmd_2": {
                "ref_audio_path": "这一额外参数可帮助你针对不同情况使用不同的参考音频与文本",
                "prompt_text": "熟悉后请新建指令使用，选择你需要的命名方式"
            },
            # 添加更多映射...
        }
        self.default_prompt_audio = "./predef_ref/正常有希/01_有希_平静.wav"
        self.default_prompt_text = "私が再び異常動作を起こさないという確証はない。"
        self.api_base_url = {'base': 'http://127.0.0.1:9880/'}
        self.deepL_api_key = "YOUR_DEEPL_API_KEY"

        if os.path.exists(self.config_file):
            self.load_config()
        else:
            self.save_config()  # 创建配置文件并保存默认内容

    def load_config(self):
        with open(self.config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
            self.role_model_mapping = config['role_model_mapping']
            self.voice_cmd_mapping = config['voice_cmd_mapping']
            self.default_prompt_audio = config['default_prompt_audio']
            self.default_prompt_text = config['default_prompt_text']
            self.api_base_url = config['API_BASE_URL']
            self.deepL_api_key = config['deepL_api_key']

    def save_config(self):
        config = {
            'role_model_mapping': self.role_model_mapping,
            'voice_cmd_mapping': self.voice_cmd_mapping,
            'default_prompt_audio': self.default_prompt_audio,
            'default_prompt_text': self.default_prompt_text,
            'API_BASE_URL': self.api_base_url,
            'deepL_api_key': self.deepL_api_key
        }
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
            
    def save_config_gui(self, default_prompt_text, default_prompt_audio, api_base_url, role_model_mapping, voice_cmd_mapping, deepL_api_key):
        config = {
            'role_model_mapping': role_model_mapping,
            'voice_cmd_mapping': voice_cmd_mapping,
            'default_prompt_audio': default_prompt_audio,
            'default_prompt_text': default_prompt_text,
            'API_BASE_URL': api_base_url,
            'deepL_api_key': deepL_api_key
        }
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
            
    def delete_role(self, role_name):
        if role_name in self.role_model_mapping:
            del self.role_model_mapping[role_name]
            self.save_config()  # 保存更改后的配置

    def delete_voice_cmd(self, cmd_name):
        if cmd_name in self.voice_cmd_mapping:
            del self.voice_cmd_mapping[cmd_name]
            self.save_config()  # 保存更改后的配置