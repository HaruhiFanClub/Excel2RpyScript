## Git
- 基本操作教程：https://www.liaoxuefeng.com/wiki/896043488029600

### 开发流程：
- 从主分支将项目fork一份到自己的仓库
- 在本地将项目clone下来，并添加远程分支:  
    - 例子：  
    `git clone 项目地址`  
    `git remote add develop  git@github.com:HaruhiFanClub/Excel2RpyScript.git`
    
- 完成功能开发之后，拉取主项目最新的改动：  
    `git pull --rebase develop develop`
- 在本地解决冲突之后将改动推到自己项目的分支：  
    `git push origin develop`
- 在github上提交pull request

- 以上流程仅供参考(慎用rebase命令)