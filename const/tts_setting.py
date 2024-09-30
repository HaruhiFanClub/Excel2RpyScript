'''
#为角色选择对应的模型路径
role_model_mapping = {
    "长门": {
        "gpt": "GPT_weights_v2/nagato_yuki-e15.ckpt",
        "sovits": "SoVITS_weights_v2/nagato_yuki_e15_s2160.pth"
    },
    "角色2": {
        "gpt": "gpt_model_2_path",
        "sovits": "sovits_model_2_path"
    },
    # 添加更多角色...
}

#为语音指令选项自定义请求参数
voice_cmd_mapping = {
    "voice_cmd_1": {
        "ref_audio_path": "path_to_reference_1.wav",
        "prompt_text": "Prompt text for voice_cmd_1"
    },
    "voice_cmd_2": {
        "ref_audio_path": "path_to_reference_2.wav",
        "prompt_text": "Prompt text for voice_cmd_2"
    },
    # 添加更多映射...
}

#选择无语音指令状态下的默认参考音频及其对应文本
default_prompt_audio = "D:/GPT-SoVITS-v2-240821/predef_ref/正常有希/01_有希_平静.wav"
default_prompt_text = "私が再び異常動作を起こさないという確証はない。"

#选择API端点
API_BASE_URL = {
    'base': 'http://127.0.0.1:9880/'
}
'''

import json
import os

class TTSConfig:
    def __init__(self, config_file='config.json'):
        self.config_file = config_file
        self.role_model_mapping = {
            "长门": {
                "gpt": "GPT_weights_v2/nagato_yuki-e15.ckpt",
                "sovits": "SoVITS_weights_v2/nagato_yuki_e15_s2160.pth"
            },
            "角色2": {
                "gpt": "gpt_model_2_path",
                "sovits": "sovits_model_2_path"
            },
            # 添加更多角色...
        }
        self.voice_cmd_mapping = {
            "voice_cmd_1": {
                "ref_audio_path": "path_to_reference_1.wav",
                "prompt_text": "Prompt text for voice_cmd_1"
            },
            "voice_cmd_2": {
                "ref_audio_path": "path_to_reference_2.wav",
                "prompt_text": "Prompt text for voice_cmd_2"
            },
            # 添加更多映射...
        }
        self.default_prompt_audio = "D:/GPT-SoVITS-v2-240821/predef_ref/正常有希/01_有希_平静.wav"
        self.default_prompt_text = "私が再び異常動作を起こさないという確証はない。"
        self.api_base_url = {'base': 'http://127.0.0.1:9880/'}

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

    def save_config(self):
        config = {
            'role_model_mapping': self.role_model_mapping,
            'voice_cmd_mapping': self.voice_cmd_mapping,
            'default_prompt_audio': self.default_prompt_audio,
            'default_prompt_text': self.default_prompt_text,
            'API_BASE_URL': self.api_base_url,
        }
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
            
    def save_config_gui(self, default_prompt_text, default_prompt_audio, api_base_url, role_model_mapping, voice_cmd_mapping):
        config = {
            'role_model_mapping': role_model_mapping,
            'voice_cmd_mapping': voice_cmd_mapping,
            'default_prompt_audio': default_prompt_audio,
            'default_prompt_text': default_prompt_text,
            'API_BASE_URL': api_base_url,
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