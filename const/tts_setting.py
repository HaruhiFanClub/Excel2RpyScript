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