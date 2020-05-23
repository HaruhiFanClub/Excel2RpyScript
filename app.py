# encoding: utf-8

"""
    程序入口
"""
from handler.converter import Converter

if __name__ == '__main__':
    c = Converter("test/示例表格.xlsx")
    texts = c.generate_rpy_elements()
    with open("./test/script.rpy", 'w') as f:
        for k, v in c.role_name_mapping.items():
            f.write(v.render() + "\n")
        f.write("label start:\n")
        for text in texts:
            for t in text.triggers:
                f.write(" "*4 + t.render() + "\n")
            f.write((" "*4 + text.render() + "\n"))
