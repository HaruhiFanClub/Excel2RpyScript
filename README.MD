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
