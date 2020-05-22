# encoding: utf-8

"""
    将Rpy对象的组合渲染成Rpy所需的文件
"""


class Render(object):
    """
    :param rpy_element_list:给定的Rpy对象的组合
    """
    def __init__(self,rpy_element_list):
        self.rpy_element_list=rpy_element_list

    def render(self):
        output_list=[]
        for each_element in self.rpy_element_list:
            output_list.append(each_element.render())
        return output_list
