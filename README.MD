# Excel文件转Rpy脚本(0.3.0)

## 开发环境
- Python 3.8

## 模块划分
```
|
|-const 配置项
|-corelib 基础依赖
     |-- exception  自定义的异常
|-dist 打包的exe文件
|-handler
     |-- converter  将Excel中的数据转化为rpy中的对象
     |-- parser     解析Excel中的数据
     |-- writer     将转化后的数据写入rpy文件
     |-- tts        语音合成功能的实现
|-model
     |-- element Rpy游戏的基本元素
     |-- process Rpy游戏的进程控制
|--tools  工具类
|--app.py 程序入口
```
## 语音合成使用说明
目前仅支持通过API方式调用[GPT-SoVITS-V2](https://github.com/RVC-Boss/GPT-SoVITS)，可在本地部署此项目或使用他人的在线服务。


## 打包程序
- 工具: pyinstaller  
- CMD: `pyinstaller -F -w -i .\asset\sos.ico .\app.py -n Excel2RpyScript`

## relase notes
- 0.1.1
    - fix [立绘回收 #20](https://github.com/HaruhiFanClub/Excel2RpyScript/issues/20)
    - fix [Nvl模式与adv模式的切换 #19](https://github.com/HaruhiFanClub/Excel2RpyScript/issues/19)
    - 去掉Exe文件的外部依赖

- 0.2.4
    - fix 条件选择在最后一行时无法读取
    - 支持对话框头像

- 0.3.0
    - 支持语音合成功能
    - 支持将待合成的中文自动翻译为日语

## TODO
~~- 支持在GUI界面中直接修改配置项~~
