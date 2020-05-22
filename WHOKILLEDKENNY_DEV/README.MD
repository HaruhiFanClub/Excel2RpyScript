# Excel文件转Rpy脚本

## 开发环境
- Python 3.8

## 模块划分
```
|
|-corelib 基础依赖
     |-- exception  自定义的异常
|-handler
     |-- converter  将Excel中的数据转化为rpy中的对象
     |-- render     将model中的元素与进程控制渲染成Rpy脚本文件
|-model
     |-- element Rpy游戏的基本元素
     |-- process Rpy游戏的进程控制
|--tools  工具类
|--app.py 程序入口
```

## TODO
- [ ] 实现基本的无分支转换流程

---2020-5-22--------------
1,修正了model/element中的一些错误，它们分布在第21行，第26行，第45行
2.在model/process中为Label类新增构造函数和成员变量和render()方法；新增Pause类
3.在handler/render中为Render类新增构造函数和成员变量和render()方法
4.在/app.py中自定义列表进行测试
5.新增/for_test目录用来存放测试用的游戏样例，包括image素材，将来还应该包括audio素材，和excel表
6.下一步将自定义excel文件编写和测试handler/converter