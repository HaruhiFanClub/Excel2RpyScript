# Excel文件转Rpy脚本(0.1.1)

## 开发环境
- Python 3.8

## 模块划分
```
|
|-corelib 基础依赖
     |-- exception  自定义的异常
|-dist 打包的exe文件
|-handler
     |-- converter  将Excel中的数据转化为rpy中的对象
     |-- render     将model中的元素与进程控制渲染成Rpy脚本文件
|-model
     |-- element Rpy游戏的基本元素
     |-- process Rpy游戏的进程控制
|--tools  工具类
|--app.py 程序入口
```


## 打包程序
- 工具: pyinstaller  
- CMD: `pyinstaller -F -w -i .\asset\sos.ico .\app.py -n Excel2RpyScript`

## relase notes
- 0.1.1
    - fix [立绘回收 #20](https://github.com/HaruhiFanClub/Excel2RpyScript/issues/20)
    - fix [Nvl模式与adv模式的切换 #19](https://github.com/HaruhiFanClub/Excel2RpyScript/issues/19)
    - 去掉Exe文件的外部依赖