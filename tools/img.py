import base64
from io import BytesIO

from tools.image_data import back_ground_gif_data


def image_to_base64(file_path, output):
    with open(file_path, "rb") as f:  # 转为二进制格式
        base64_data = base64.b64encode(f.read())  # 使用base64进行加密
        file = open(output, 'wt')  # 写成文本格式
        file.write(str(base64_data))
        file.close()

def base64_to_image(file_path):
    with open(file_path, "r") as file:
        x = base64.b64decode(file.read())
        f = BytesIO()
        f.write(x)
        return f
