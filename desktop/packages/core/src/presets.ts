// 自动从 config.json 生成的内置预设（凉宫春日，远端服务）。请勿手改；更新请重新生成。
import { deriveTone, type TtsConfig } from "./tts"

export interface BuiltinPreset {
  id: string
  name: string
  config: TtsConfig
}

// 内置远端角色的 API 端点（不在 UI 展示）
const HARUHI_REMOTE_API = "https://tts.haruyuki.cn/"

// 参考音频所在文件夹名 → 角色名（把每条语音指令归属到对应内置角色）
const FOLDER_TO_ROLE: Record<string, string> = {
  正常有希: "长门有希",
  消失有希: "长门有希（消失）",
  凉宫春日: "凉宫春日",
  阿虚: "阿虚",
  古泉一树: "古泉一树",
  朝比奈实玖瑠: "朝比奈实玖瑠",
  大朝比奈: "朝比奈实玖瑠（大）",
  虚妹: "虚妹",
  中河: "中河",
  朝仓凉子: "朝仓凉子",
  鹤屋: "鹤屋学姐",
}

// 取 ref_audio_path 的所属文件夹名（倒数第二段）
function refFolder(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2]! : ""
}

// 把原始远端配置富化为「内置角色」：标记 builtin/启用、注入端点、给每条语音指令归属角色与语气。
// 内置角色锁定（不可编辑/删除），UI 不展示其模型与端点。
function enrichBuiltinRemote(base: TtsConfig): TtsConfig {
  const roleModelMapping: TtsConfig["roleModelMapping"] = {}
  for (const [name, m] of Object.entries(base.roleModelMapping)) {
    roleModelMapping[name] = {
      ...m,
      enabled: m.enabled ?? true,
      builtin: true,
      apiBaseUrl: m.apiBaseUrl ?? HARUHI_REMOTE_API,
    }
  }
  const voiceCmdMapping: TtsConfig["voiceCmdMapping"] = {}
  for (const [cmd, v] of Object.entries(base.voiceCmdMapping)) {
    const role = v.role ?? FOLDER_TO_ROLE[refFolder(v.refAudioPath)]
    voiceCmdMapping[cmd] = {
      ...v,
      ...(role ? { role } : {}),
      tone: v.tone ?? deriveTone(v.refAudioPath),
    }
  }
  return { ...base, apiBaseUrl: HARUHI_REMOTE_API, roleModelMapping, voiceCmdMapping }
}

const HARUHI_REMOTE: TtsConfig = {
  "serviceMode": "remote",
  "apiBaseUrl": "https://tts.haruyuki.cn/",
  "roleModelMapping": {
    "长门有希": {
      "gpt": "GPT_weights_v2ProPlus/Nagato_Normal_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/Nagato_Normal_20250620_e12_s72.pth"
    },
    "阿虚": {
      "gpt": "GPT_weights_v2ProPlus/Kyon_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/Kyon_20250620_e1500_s82500.pth"
    },
    "长门有希（消失）": {
      "gpt": "GPT_weights_v2ProPlus/Nagato_Disappearance_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/Nagato_Disappearance_20250620_e12_s132.pth"
    },
    "古泉一树": {
      "gpt": "GPT_weights_v2ProPlus/Itsuki_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/Itsuki_20250620_e12_s180.pth"
    },
    "朝比奈实玖瑠": {
      "gpt": "GPT_weights_v2ProPlus/Mikuru_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/Mikuru_20250620_e12_s144.pth"
    },
    "朝比奈实玖瑠（大）": {
      "gpt": "GPT_weights_v2ProPlus/OldMikuru_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/OldMikuru_20250620_e12_s144.pth"
    },
    "鹤屋学姐": {
      "gpt": "GPT_weights_v2ProPlus/Tsuruya_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/Tsuruya_20250620_e12_s132.pth"
    },
    "朝仓凉子": {
      "gpt": "GPT_weights_v2ProPlus/Asakura_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/Asakura_20250620_e12_s156.pth"
    },
    "虚妹": {
      "gpt": "GPT_weights_v2ProPlus/KyonSister_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/KyonSister_20250620_e12_s72.pth"
    },
    "凉宫春日": {
      "gpt": "GPT_weights_v2ProPlus/Haruhi_20250620-e10.ckpt",
      "sovits": "SoVITS_weights_v2ProPlus/Haruhi_20250620_e1650_s41250.pth"
    },
    "中河": {
      "gpt": "GPT_weights_v2/Nakagawa_20250225-e10.ckpt",
      "sovits": "SoVITS_weights_v2/Nakagawa_20250225_e50_s250.pth"
    }
  },
  "voiceCmdMapping": {
    "yuki_a1": {
      "refAudioPath": "./predef_ref/正常有希/01_有希_平静.wav",
      "promptText": "私が再び異常動作を起こさないという確証はない。"
    },
    "yuki_a2": {
      "refAudioPath": "./predef_ref/正常有希/02_有希_平静_温柔.wav",
      "promptText": "頭の中にエイリアンが住みついてしまった女の子の話。"
    },
    "yuki_a3": {
      "refAudioPath": "./predef_ref/正常有希/03_有希_平静_略带笑意.wav",
      "promptText": "夢の海原に体を預け、三度の夏を待つ。"
    },
    "yuki_a4": {
      "refAudioPath": "./predef_ref/正常有希/04_有希_有感情_温柔.wav",
      "promptText": "しおりは約束、閉ざされた世界の扉を開いて、今ひとたびの物語を始めるための。"
    },
    "haruhi_1": {
      "refAudioPath": "./predef_ref/凉宫春日/01_凉宫春日_不甘心_遗憾.wav",
      "promptText": "悔しいわ。せめて昨日これを思いついていれば追加撮影することだってできたかもしれないのに。"
    },
    "haruhi_2": {
      "refAudioPath": "./predef_ref/凉宫春日/02_凉宫春日_催促.wav",
      "promptText": "ちょっとキョン、監督に無断でそういう大事なこと決めるんじゃないわよ。"
    },
    "haruhi_3": {
      "refAudioPath": "./predef_ref/凉宫春日/03_凉宫春日_基准积极状态.wav",
      "promptText": "そんなのこれから考えるに決まってるでしょう?さあ、何から食べようかしら?"
    },
    "haruhi_4": {
      "refAudioPath": "./predef_ref/凉宫春日/04_凉宫春日_安慰别人.wav",
      "promptText": "何よその目は。ほら、ボサッとしてないで、さっさとミクルちゃんを取りなさい。"
    },
    "haruhi_5": {
      "refAudioPath": "./predef_ref/凉宫春日/05_凉宫春日_害羞_着急掩饰.wav",
      "promptText": "な、何よあんた、まだいたの?"
    },
    "haruhi_6": {
      "refAudioPath": "./predef_ref/凉宫春日/06_凉宫春日_平静_冷静_指示.wav",
      "promptText": "このメールを確認した方は、至急下記までお電話ください。"
    },
    "haruhi_7": {
      "refAudioPath": "./predef_ref/凉宫春日/07_凉宫春日_强硬争辩.wav",
      "promptText": "そんなのあるわけないわ。あたしのメールアドレスはアホの谷口だって知るわけないし。あんたがどこからか入手したとも思えない。"
    },
    "haruhi_8": {
      "refAudioPath": "./predef_ref/凉宫春日/08_凉宫春日_很激动高兴.wav",
      "promptText": "SOS団はね、いつも、いつまででも、何があっても、一緒なんだから!"
    },
    "haruhi_9": {
      "refAudioPath": "./predef_ref/凉宫春日/09_凉宫春日_很疑惑.wav",
      "promptText": "今から、映画を作るですって?"
    },
    "haruhi_10": {
      "refAudioPath": "./predef_ref/凉宫春日/10_凉宫春日_恍然大悟.wav",
      "promptText": "ああ、あなたなのね。ちょっとその場で回ってみてくれる?"
    },
    "haruhi_11": {
      "refAudioPath": "./predef_ref/凉宫春日/11_凉宫春日_惊讶_兴奋.wav",
      "promptText": "もっとドラマっぽくするの。詩を読む前にいくつかセリフを入れましょうよ。その方が目を引くと思わない?"
    },
    "haruhi_12": {
      "refAudioPath": "./predef_ref/凉宫春日/12_凉宫春日_成就感.wav",
      "promptText": "それをサクッと豪華に編集しましょうよ。パソコンならほら、ここに最新型があるから。"
    },
    "haruhi_13": {
      "refAudioPath": "./predef_ref/凉宫春日/13_凉宫春日_担心.wav",
      "promptText": "ねえキョン、手伝ってくれそうな女の子の心当たりはない？"
    },
    "haruhi_14": {
      "refAudioPath": "./predef_ref/凉宫春日/14_凉宫春日_日常交谈感.wav",
      "promptText": "何があったか詮索はしないけど、あんまり女の子を泣かせるようなことはしないことね。?"
    },
    "haruhi_15": {
      "refAudioPath": "./predef_ref/凉宫春日/15_凉宫春日_有些惊奇.wav",
      "promptText": "本当なの、古泉くん。携帯落とすって結構大事じゃない?"
    },
    "haruhi_16": {
      "refAudioPath": "./predef_ref/凉宫春日/16_凉宫春日_有些意外.wav",
      "promptText": "あら、朝比奈さんを連れてこられなくて競争に負けたの忘れたの?もちろん、バトン部のみんなの分もよ。"
    },
    "haruhi_17": {
      "refAudioPath": "./predef_ref/凉宫春日/17_凉宫春日_有些生气_吵架.wav",
      "promptText": "この学校の文芸部でしょう?この学校の文化祭で場所がないってどういうことよ!"
    },
    "haruhi_18": {
      "refAudioPath": "./predef_ref/凉宫春日/18_凉宫春日_有些疑问.wav",
      "promptText": "だって、もしいつでもどこでも使えるのなら、なんで私の周りにそういう人が一人もいないのよ。それっておかしいじゃない。"
    },
    "haruhi_19": {
      "refAudioPath": "./predef_ref/凉宫春日/19_凉宫春日_有些高兴_稳定的春日.wav",
      "promptText": "誰がそんなこと言ったのよ。これからだって当然探し続けるわよ。もちろんあんたも手伝ってくれるわよね。"
    },
    "haruhi_20": {
      "refAudioPath": "./predef_ref/凉宫春日/20_凉宫春日_松了一口气.wav",
      "promptText": "と、オッケーね。キャンで登録しておいたから、何かわかったら逐一メールよこしなさい。"
    },
    "haruhi_21": {
      "refAudioPath": "./predef_ref/凉宫春日/21_凉宫春日_极度震惊_指责.wav",
      "promptText": "あなた、なにそのスタイル!なんて犯罪的なのかしら!"
    },
    "haruhi_22": {
      "refAudioPath": "./predef_ref/凉宫春日/22_凉宫春日_比较高兴.wav",
      "promptText": "当たり前でしょう。他に誰がいるのよ。古泉くん、何か楽器はできる？"
    },
    "haruhi_23": {
      "refAudioPath": "./predef_ref/凉宫春日/23_凉宫春日_特别激动高兴.wav",
      "promptText": "どうもどうも、ありがとう。突然乱入しちゃったけどでも楽しかったでしょう。"
    },
    "haruhi_24": {
      "refAudioPath": "./predef_ref/凉宫春日/24_凉宫春日_着急_解释_据理力争.wav",
      "promptText": "あなたの同人誌に載ってたし、あれはもっとたくさんの人に知られるべきよ。それなのに、こんなんじゃ絶対ダメだわ！"
    },
    "haruhi_25": {
      "refAudioPath": "./predef_ref/凉宫春日/25_凉宫春日_着急_质问.wav",
      "promptText": "生徒の意見を聞かないで、何が実行委員会よ。"
    },
    "haruhi_26": {
      "refAudioPath": "./predef_ref/凉宫春日/26_凉宫春日_认真_严厉_嫌弃.wav",
      "promptText": "あんたには関係ないでしょう。古泉くん、行きましょう。"
    },
    "haruhi_27": {
      "refAudioPath": "./predef_ref/凉宫春日/27_凉宫春日_认真_微怒.wav",
      "promptText": "何が俺だよ。俺って誰よ。なれなれしいにも程があるわ。"
    },
    "haruhi_28": {
      "refAudioPath": "./predef_ref/凉宫春日/28_凉宫春日_认真_激励.wav",
      "promptText": "文化祭の実行委員がいるところよ。直接行って話をつけるわ。"
    },
    "haruhi_29": {
      "refAudioPath": "./predef_ref/凉宫春日/29_凉宫春日_认真思虑.wav",
      "promptText": "栞は道標。いつか迷子になったとしたら、結末はあなたに選んでほしい。栞は道標。"
    },
    "haruhi_30": {
      "refAudioPath": "./predef_ref/凉宫春日/30_凉宫春日_轻松完成_愉快.wav",
      "promptText": "というわけで、これにて完成よ。ユキ、どうかしら。"
    },
    "haruhi_31": {
      "refAudioPath": "./predef_ref/凉宫春日/31_凉宫春日_这样也没什么不好_带动大家.wav",
      "promptText": "あんた以外にやる人いないじゃない。ほら、さっさと取り掛かる。"
    },
    "haruhi_32": {
      "refAudioPath": "./predef_ref/凉宫春日/32_凉宫春日_遗憾.wav",
      "promptText": "そうなの?残念ね、焼きたてが一番なのに。"
    },
    "kyon_1": {
      "refAudioPath": "./predef_ref/阿虚/01_阿虚_认真_有些严厉.wav",
      "promptText": "お前の親玉に言ってくれ。お前が消えるなりいなくなるなりしたら、いいか。俺は暴れるぞ。"
    },
    "kyon_2": {
      "refAudioPath": "./predef_ref/阿虚/02_阿虚_认真_敌对.wav",
      "promptText": "つべこべ抜かすなら、ハルヒと一緒に今度こそ世界を作り変えてやる。お前はいるが、情報統合思念体はいないような世界だって。"
    },
    "kyon_3": {
      "refAudioPath": "./predef_ref/阿虚/03_阿虚_认真讲述.wav",
      "promptText": "しかし、俺は自らの意思でこの世界、すなわち、長門は宇宙人で、朝比奈さんは未来人で。"
    },
    "kyon_4": {
      "refAudioPath": "./predef_ref/阿虚/04_阿虚_声调更高的讲述.wav",
      "promptText": "本来なら今朝は、退院予定日の12月22日の朝であり、病院のベッドで普通に目覚めるはずだったのだが。"
    },
    "kyon_5": {
      "refAudioPath": "./predef_ref/阿虚/05_阿虚_窘迫地否定_想办法解释.wav",
      "promptText": "そ、そうなんです。俺ファンなのに朝比奈さんのことまだよく知らなくて。"
    },
    "kyon_6": {
      "refAudioPath": "./predef_ref/阿虚/06_阿虚_语无伦次_歉意_难言.wav",
      "promptText": "あ、いえ、お忙しいところすみません。実はですね、今日はこの後雨が降るんですよ。"
    },
    "kyon_7": {
      "refAudioPath": "./predef_ref/阿虚/07_阿虚_差不多得了.wav",
      "promptText": "おいおい、北高で北高の生徒捕まえて、なんちゅう言い草だ。"
    },
    "kyon_8": {
      "refAudioPath": "./predef_ref/阿虚/08_阿虚_无奈_否定_理所当然.wav",
      "promptText": "おいおい、人が真面目に話しているのに、そういう態度は良くないと思うぞ。"
    },
    "kyon_9": {
      "refAudioPath": "./predef_ref/阿虚/09_阿虚_着急_否定_讲道理.wav",
      "promptText": "おいおい待て待て、そうじゃなくて、類友ってやつで呼ばれたんじゃないかって話だ。"
    },
    "kyon_10": {
      "refAudioPath": "./predef_ref/阿虚/10_阿虚_感觉不对劲_有些怀疑.wav",
      "promptText": "じゃあ、自分が本物のそれかと問われると、なんか違う。"
    },
    "kyon_11": {
      "refAudioPath": "./predef_ref/阿虚/11_阿虚_无奈_如我所想.wav",
      "promptText": "やれやれ、古泉のやつ、すっかりつまんないやつ認定されてるじゃねえか。ちょっとだけ同情してやるぜ。"
    },
    "kyon_12": {
      "refAudioPath": "./predef_ref/阿虚/12_阿虚_思索_带有疑问.wav",
      "promptText": "それにしてもあれだな。俺の周囲の巨乳キャラといえば朝比奈さんだが、こうしてみると。"
    },
    "kyon_13": {
      "refAudioPath": "./predef_ref/阿虚/13_阿虚_思索_更加沉着的推理.wav",
      "promptText": "古泉の口ぶりからして、もしかすると光陽園学院でも、ハルヒはあの自己紹介をぶちかましたのかもしれない。"
    },
    "kyon_14": {
      "refAudioPath": "./predef_ref/阿虚/14_阿虚_感觉不妙_搞砸了.wav",
      "promptText": "ダメだ。言葉を重ねることに、まるでショベルカーでも使って巨大な墓穴を掘っているかのような錯覚に陥る。"
    },
    "kyon_15": {
      "refAudioPath": "./predef_ref/阿虚/15_阿虚_那样的话太好了_欢快_询问.wav",
      "promptText": "朝倉はおやつタイムか。その手に持ってるのって磯辺巻とあんころ餅だろう。"
    },
    "kyon_16": {
      "refAudioPath": "./predef_ref/阿虚/16_阿虚_询问_既然如此所以怎样.wav",
      "promptText": "で、人通りが多いところに来たのはいいが、何をするつもりだ。"
    },
    "kyon_17": {
      "refAudioPath": "./predef_ref/阿虚/17_阿虚_当然不能这样_略微震惊.wav",
      "promptText": "無茶言うな。大道芸が見たいならサブステージでやってるはずだから、それを見てこい。"
    },
    "kyon_18": {
      "refAudioPath": "./predef_ref/阿虚/18_阿虚_客气_表达遗憾_社交礼仪回复.wav",
      "promptText": "いいえいいえ、気にしないでください。それより、書道部のイベント、中止になっちゃって残念でしたね。"
    },
    "kyon_19": {
      "refAudioPath": "./predef_ref/阿虚/19_阿虚_提出疑问.wav",
      "promptText": "なんだ、お前だけか。俺は涼宮に呼び出されたんだが。"
    },
    "kyon_20": {
      "refAudioPath": "./predef_ref/阿虚/20_阿虚_是这么一回事_向别人说明.wav",
      "promptText": "ああ、メインステージで予定されていたOB公演が中止になったらしくてな。窮境穴埋めのバンドを募集するそうだ。"
    },
    "kyon_21": {
      "refAudioPath": "./predef_ref/阿虚/21_阿虚_道歉_向别人说明.wav",
      "promptText": "鶴屋さん、無理言ってすみません。朝比奈さんが拉致られたせいで、焼きそば喫茶は大変だったんじゃないですか。"
    },
    "kyon_22": {
      "refAudioPath": "./predef_ref/阿虚/22_阿虚_自信_交给我吧.wav",
      "promptText": "安心しろう。対象となるものが違うだけで、お前の頭だって似たようなもんじゃないか。"
    },
    "kyon_23": {
      "refAudioPath": "./predef_ref/阿虚/23_阿虚_生气_训斥.wav",
      "promptText": "えい、離せ谷口!どうして俺がお前に拉致られにはならんのだ!"
    },
    "kyon_24": {
      "refAudioPath": "./predef_ref/阿虚/24_阿虚_喘不上来气.wav",
      "promptText": "いや、けど、メールで帰るだけで帰るのよな。"
    },
    "kyon_25": {
      "refAudioPath": "./predef_ref/阿虚/25_阿虚_没错就是这样_故作轻快.wav",
      "promptText": "そう、それです。昨日雨で公演が中止になったバトン部とでやることになったんです。"
    },
    "kyon_26": {
      "refAudioPath": "./predef_ref/阿虚/26_阿虚_催促式地提出疑问.wav",
      "promptText": "おいおい、涼宮が気に入ったところで、これが答えとは限らんぞ。"
    },
    "kyon_27": {
      "refAudioPath": "./predef_ref/阿虚/27_阿虚_原来如此.wav",
      "promptText": "なるほど、朝比奈さんのエアギタリストデビューがこの世界のあるべき姿なんですね。"
    },
    "kyon_28": {
      "refAudioPath": "./predef_ref/阿虚/28_阿虚_不带恶意的抱怨.wav",
      "promptText": "古泉のやつ、感心感心ばかり言うので、つい俺までそんなことを言ってしまった。"
    },
    "kyon_29": {
      "refAudioPath": "./predef_ref/阿虚/29_阿虚_刚刚了解情况_询问.wav",
      "promptText": "ああ、緊急事態ですか。何かまずいことにでもなったとか?"
    },
    "kyon_30": {
      "refAudioPath": "./predef_ref/阿虚/30_阿虚_云淡风轻_戏谑.wav",
      "promptText": "よしよし、お役目ご苦労。また公務員さんに預かってもらうからな。家に帰るまでおとなしくしてるんだぞ。"
    },
    "kyon_31": {
      "refAudioPath": "./predef_ref/阿虚/31_阿虚_尽管如此但不可思议.wav",
      "promptText": "それは構いませんけど、本当にいいんですかね、朝比奈さんに許可取る前にエントリーしちゃっても。"
    },
    "kyon_32": {
      "refAudioPath": "./predef_ref/阿虚/32_阿虚_着急_不服气.wav",
      "promptText": "だからって、一人で行くことはないだろう。俺は副責任者だったんだ。行ってくれれば俺も一緒に謝りに行きたかったのに。"
    },
    "kyon_33": {
      "refAudioPath": "./predef_ref/阿虚/33_阿虚_试探着询问.wav",
      "promptText": "鶴屋さん、もしかして朝比奈さんをミスコンにエントリーしましたね?"
    },
    "kyon_34": {
      "refAudioPath": "./predef_ref/阿虚/34_阿虚_日常对话.wav",
      "promptText": "とはいえ、だからこそ緊張という意味ではさっきより条件が悪い。その眼差しは、一回目の時以上に。"
    },
    "yuki_b1": {
      "refAudioPath": "./predef_ref/消失有希/01_消失有希_疑惑.wav",
      "promptText": "えっ、SOS団。"
    },
    "yuki_b2": {
      "refAudioPath": "./predef_ref/消失有希/02_消失有希_有些畏缩.wav",
      "promptText": "ギターのことはよくわからない。"
    },
    "yuki_b3": {
      "refAudioPath": "./predef_ref/消失有希/03_消失有希_平静.wav",
      "promptText": "宣伝に使う、電光掲示板みたいなもの。"
    },
    "yuki_b4": {
      "refAudioPath": "./predef_ref/消失有希/04_消失有希_努力地表达.wav",
      "promptText": "特に古典作品のそれは、人間というものの普遍的性質を如実に表している。"
    },
    "yuki_b5": {
      "refAudioPath": "./predef_ref/消失有希/05_消失有希_迟疑_语速缓慢.wav",
      "promptText": "私の、時間へ、あなたを……"
    },
    "yuki_b6": {
      "refAudioPath": "./predef_ref/消失有希/06_消失有希_认真.wav",
      "promptText": "しおりは道しるべ。いつか迷子になったとしたら、結末はあなたに選んでほしい。"
    },
    "yuki_b7": {
      "refAudioPath": "./predef_ref/消失有希/07_消失有希_激动_快语速.wav",
      "promptText": "全部で5冊も売れた。この世界で少なくとも5人の人があの同人誌を読んでくれている。"
    },
    "yuki_b8": {
      "refAudioPath": "./predef_ref/消失有希/08_消失有希_激动_感情充沛_解释并不是这样_偏高兴.wav",
      "promptText": "そんなことない。あなたはとてもたくさんのことをやってくれた。"
    },
    "itsuki_1": {
      "refAudioPath": "./predef_ref/古泉一树/01_古泉_思索_劝说.wav",
      "promptText": "ですが、バトン部のステージが終わってからつい先ほどまで、ずっと聞き込みをしていたのですよ。"
    },
    "itsuki_2": {
      "refAudioPath": "./predef_ref/古泉一树/02_古泉_否定.wav",
      "promptText": "いいえ、呼ぶも何も、つい先ほど初めてお目にかかったばかりです。"
    },
    "itsuki_3": {
      "refAudioPath": "./predef_ref/古泉一树/03_古泉_询问.wav",
      "promptText": "失礼ですが、その件はあなたと涼宮さんの過去に何か関係があるのですか?"
    },
    "itsuki_4": {
      "refAudioPath": "./predef_ref/古泉一树/04_古泉_平静.wav",
      "promptText": "初対面の人間にこうも絡もうとするあなたの方が、僕としてはどうかと思いますがね。"
    },
    "itsuki_5": {
      "refAudioPath": "./predef_ref/古泉一树/05_古泉_夸张_戏剧化.wav",
      "promptText": "ああ、早くジョン・スミスが来てくれないと、涼宮さんが大変なことになってしまう。"
    },
    "itsuki_6": {
      "refAudioPath": "./predef_ref/古泉一树/06_古泉_疑惑.wav",
      "promptText": "バンドを組むのはいいとして、演奏は誰がするんです?それに楽器は?"
    },
    "itsuki_7": {
      "refAudioPath": "./predef_ref/古泉一树/07_古泉_下定决心_故作轻松自信.wav",
      "promptText": "光栄です。たとえ行き当たりばったりだとしても、やるからには最善を尽くしますよ。"
    },
    "itsuki_8": {
      "refAudioPath": "./predef_ref/古泉一树/08_古泉_轻松_带有明显笑意.wav",
      "promptText": "まさか。ちょうど見せ番をされていた女子生徒の皆さんに、お貸しくださいと丁寧にお願いしただけです。"
    },
    "itsuki_9": {
      "refAudioPath": "./predef_ref/古泉一树/09_古泉_回应别人的询问_无事发生的语气.wav",
      "promptText": "いいえ、なんでもありませんよ。さあ、我々も参りましょうか。"
    },
    "itsuki_10": {
      "refAudioPath": "./predef_ref/古泉一树/10_古泉_思索推理_压低语气.wav",
      "promptText": "僕は、涼宮さんに、北高にこれほど親しい方がいらっしゃるとは、今まで一度も聞いたことがなかったんです。"
    },
    "itsuki_11": {
      "refAudioPath": "./predef_ref/古泉一树/11_古泉_思索到了某种可能_陷入惊疑.wav",
      "promptText": "まさに晴天の霹靂だった。この驚きが想像できますか?"
    },
    "itsuki_12": {
      "refAudioPath": "./predef_ref/古泉一树/12_古泉_表达遗憾_否定.wav",
      "promptText": "でもね、残念なことに、それだけなんですよ。"
    },
    "itsuki_13": {
      "refAudioPath": "./predef_ref/古泉一树/13_古泉_无奈.wav",
      "promptText": "涼宮さんはいつまでたっても、僕の属性にしか興味をお示しにならないのです。"
    },
    "itsuki_14": {
      "refAudioPath": "./predef_ref/古泉一树/14_古泉_思索_觉得有趣.wav",
      "promptText": "そうですか。それはそれで興味深いですね。有益な情報に感謝します。"
    },
    "itsuki_15": {
      "refAudioPath": "./predef_ref/古泉一树/15_古泉_玩味的态度.wav",
      "promptText": "涼宮さんがご一緒されるのです。我々も楽しみつつ、彼女を退屈させないような何かを。"
    },
    "itsuki_16": {
      "refAudioPath": "./predef_ref/古泉一树/16_古泉_赞叹.wav",
      "promptText": "すごい混雑ですね。さすがに昼時です。これではゆっくり買い物もできません。"
    },
    "itsuki_17": {
      "refAudioPath": "./predef_ref/古泉一树/17_古泉_原来如此_赞许.wav",
      "promptText": "なるほど。さすが涼宮さん、敬願ですね。一般大衆の真理をうまく言い当てています。"
    },
    "itsuki_18": {
      "refAudioPath": "./predef_ref/古泉一树/18_古泉_正式语气的沟通.wav",
      "promptText": "涼宮さん、あの方ですよ。朝、ミスコンにエントリーするという話をした。"
    },
    "itsuki_19": {
      "refAudioPath": "./predef_ref/古泉一树/19_古泉_打招呼_和对方客气.wav",
      "promptText": "そちらのお嬢さん。ええ、あなた方です。詩の朗読はいかがですか?"
    },
    "itsuki_20": {
      "refAudioPath": "./predef_ref/古泉一树/20_古泉_有些催促.wav",
      "promptText": "そろそろ始めましょう。長門さん、一歩前へどうぞ。"
    },
    "itsuki_21": {
      "refAudioPath": "./predef_ref/古泉一树/21_古泉_震惊.wav",
      "promptText": "えっ、僕が長門さんの代役ですか。身長が全く違いますが。"
    },
    "itsuki_22": {
      "refAudioPath": "./predef_ref/古泉一树/22_古泉_认真_严肃.wav",
      "promptText": "ユキ、僕は不治の病で、もう死ぬ。君とはこれでお別れだ。"
    },
    "itsuki_23": {
      "refAudioPath": "./predef_ref/古泉一树/23_古泉_思索_十分疑惑_迟疑.wav",
      "promptText": "今、僕らを見るあなたの視線が、なんと言いますか、いつもより何か…"
    },
    "mikuru_a1": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/01_实玖瑠_犹豫.wav",
      "promptText": "はじめまして…ですけど…"
    },
    "mikuru_a2": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/02_实玖瑠_慌张.wav",
      "promptText": "えっと、バトンの経験なんてないですし、それに私、ここを離れちゃいけないんです。"
    },
    "mikuru_a3": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/03_实玖瑠_畏缩_难言.wav",
      "promptText": "それは確かに残念でしたけど、書道とバンドでは全然話が違いますし。"
    },
    "mikuru_a4": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/04_实玖瑠_高兴.wav",
      "promptText": "お気持ちはありがたいですけど、傘では解決になりませんから。えへへ。"
    },
    "mikuru_a5": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/05_实玖瑠_有些愧疚.wav",
      "promptText": "ごめんなさい。対処記号もお見せできなくて、本当に残念です。"
    },
    "mikuru_a6": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/06_实玖瑠_热切欢迎.wav",
      "promptText": "いらっしゃいませ。来てくれたんですね。サービスしちゃいますよ。"
    },
    "mikuru_a7": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/07_实玖瑠_局促_害羞_硬着头皮.wav",
      "promptText": "に、二年二組から、焼きそばの出前に、き、きました。"
    },
    "mikuru_a8": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/08_实玖瑠_激动_解释.wav",
      "promptText": "ち、違いますよ。クラスのみんなの分も一緒です。お店が忙しくて。"
    },
    "mikuru_a9": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/09_实玖瑠_激动_哭腔_倾诉.wav",
      "promptText": "ずっと、ずっとさっきから、なんかおかしいって、なんか変だって。"
    },
    "mikuru_a10": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/10_实玖瑠_比较平静地说话_有些担心.wav",
      "promptText": "ええ、昨日までは別の人がやる予定だったのに、なぜか今日来たらそんな話になってて。"
    },
    "mikuru_a11": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/11_实玖瑠_激动_着急.wav",
      "promptText": "も、もー、キョンくんったらー、まだ高校生なんだから、そんなのダメですー。"
    },
    "mikuru_a12": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/12_实玖瑠_平静地说话.wav",
      "promptText": "で、その時は理由もわからないまま、その言葉を書くんですけど。"
    },
    "mikuru_a13": {
      "refAudioPath": "./predef_ref/朝比奈实玖瑠/13_实玖瑠_欣慰_释然.wav",
      "promptText": "彼女がいなければ、私は今、この舞台に立っていなかったと思います。"
    },
    "sister_1": {
      "refAudioPath": "./predef_ref/虚妹/01_虚妹_高兴.wav",
      "promptText": "ふわー、キョン君帰ってたんだ。お帰りー。"
    },
    "sister_2": {
      "refAudioPath": "./predef_ref/虚妹/02_虚妹_疑惑.wav",
      "promptText": "んー、そこそこなんだ。"
    },
    "nakagawa_1": {
      "refAudioPath": "./predef_ref/中河/1_中河_日常语气.wav",
      "promptText": "その後村人たちはすっかり赤鬼を信用して遊びに来るようになり"
    },
    "nakagawa_2": {
      "refAudioPath": "./predef_ref/中河/2_中河_沉稳自信.wav",
      "promptText": "連れてってやるぞそれが男というものだ"
    },
    "nakagawa_3": {
      "refAudioPath": "./predef_ref/中河/3_中河_非常认真.wav",
      "promptText": "そして俺は決めたこの二人の恋がうまくいくよう応援すると"
    },
    "nakagawa_4": {
      "refAudioPath": "./predef_ref/中河/4_中河_平静讲述.wav",
      "promptText": "なぜ砂と友達なのかとよく聞かれるが同じマンションで隣どうして"
    },
    "nakagawa_5": {
      "refAudioPath": "./predef_ref/中河/5_中河_生气.wav",
      "promptText": "しっかりしろ。二人を応援するって決めただろう。"
    },
    "nakagawa_6": {
      "refAudioPath": "./predef_ref/中河/6_中河_试探性提出.wav",
      "promptText": "もう敬語はいいから多分タメですよねコウイチ"
    },
    "nakagawa_7": {
      "refAudioPath": "./predef_ref/中河/7_中河_思索.wav",
      "promptText": "なぜいつも赤くなって汗とぼしているのか"
    },
    "oldmikuru_1": {
      "refAudioPath": "./predef_ref/大朝比奈/01_大朝比奈_迟疑_为难.wav",
      "promptText": "私って、そこまで融通効かない子だったのかなぁ……"
    },
    "oldmikuru_2": {
      "refAudioPath": "./predef_ref/大朝比奈/02_大朝比奈_认真.wav",
      "promptText": "これと同じようなことが、次元ブックマーカーで可能になるということなんです。"
    },
    "oldmikuru_3": {
      "refAudioPath": "./predef_ref/大朝比奈/03_大朝比奈_基准交谈语气.wav",
      "promptText": "私が会ってはいけない人がこの時間帯ここにいないことはすでに調査済みです。"
    },
    "oldmikuru_4": {
      "refAudioPath": "./predef_ref/大朝比奈/04_大朝比奈_困惑.wav",
      "promptText": "でも、歪みの原因はこれじゃないみたい。どういうこと?"
    },
    "oldmikuru_5": {
      "refAudioPath": "./predef_ref/大朝比奈/05_大朝比奈_轻快.wav",
      "promptText": "その意気ですよ。では移動しましょうか。飛び先を指定してください。"
    },
    "asakura_1": {
      "refAudioPath": "./predef_ref/朝仓凉子/01_朝仓凉子_质问.wav",
      "promptText": "こんなことまでしてクラス展示を手伝いたくなかったってわけ?ひどいじゃない。"
    },
    "asakura_2": {
      "refAudioPath": "./predef_ref/朝仓凉子/02_朝仓凉子_犹豫.wav",
      "promptText": "そうなんだけど、この時間にやってもいいっていう人が誰もいなかったから。"
    },
    "asakura_3": {
      "refAudioPath": "./predef_ref/朝仓凉子/03_朝仓凉子_没有关系.wav",
      "promptText": "ありがとう。じゃあ、廊下側をお願いね。私は窓側をやるから。"
    },
    "asakura_4": {
      "refAudioPath": "./predef_ref/朝仓凉子/04_朝仓凉子_略高兴.wav",
      "promptText": "それができちゃうくらい写真が欲しい、ってことなのかな?"
    },
    "asakura_5": {
      "refAudioPath": "./predef_ref/朝仓凉子/05_朝仓凉子_高兴.wav",
      "promptText": "題して、これを見ればまるわかり、しったかぶりハムレット。"
    },
    "asakura_6": {
      "refAudioPath": "./predef_ref/朝仓凉子/06_朝仓凉子_严肃.wav",
      "promptText": "恋する心にも劣らぬ速さで、復讐を途絶て見せましょう。"
    },
    "asakura_7": {
      "refAudioPath": "./predef_ref/朝仓凉子/07_朝仓凉子_赞叹.wav",
      "promptText": "すごく綺麗にまとまってるさすがクニキラ君ね。"
    },
    "asakura_8": {
      "refAudioPath": "./predef_ref/朝仓凉子/08_朝仓凉子_局促_拘谨.wav",
      "promptText": "じゃあ、お願いするわ。ありがとう。"
    },
    "asakura_9": {
      "refAudioPath": "./predef_ref/朝仓凉子/09_朝仓凉子_热情问候.wav",
      "promptText": "体は大丈夫?床で寝ちゃったから痛いんじゃない?"
    },
    "asakura_10": {
      "refAudioPath": "./predef_ref/朝仓凉子/10_朝仓凉子_热情兴奋.wav",
      "promptText": "おかえりなさい。聞いて、みんなも朗読劇、面白そうだって。"
    },
    "asakura_11": {
      "refAudioPath": "./predef_ref/朝仓凉子/11_朝仓凉子_忧虑.wav",
      "promptText": "あの、ブレーカーが落ちたのは一年五組の教室だけじゃなかったんですよね。"
    },
    "asakura_12": {
      "refAudioPath": "./predef_ref/朝仓凉子/12_朝仓凉子_着急.wav",
      "promptText": "今は考えないことにするわ。とにかく展示物をちゃんと完成させたいの。"
    },
    "asakura_13": {
      "refAudioPath": "./predef_ref/朝仓凉子/13_朝仓凉子_意味深长.wav",
      "promptText": "でも、なるべく後悔はしたくないから。やるからには全力よ。"
    },
    "asakura_14": {
      "refAudioPath": "./predef_ref/朝仓凉子/14_朝仓凉子_平静说话.wav",
      "promptText": "また文ゲームにあなたを取られちゃう前に、後片付けを手伝ってもらっていいかしら。"
    },
    "tsuruya_1": {
      "refAudioPath": "./predef_ref/鹤屋/01_鹤屋_基准交谈语气.wav",
      "promptText": "じゃあこれからユキッコって呼ばユキッコさ、ウェイトレスやるときだけ眼鏡取らない?"
    },
    "tsuruya_2": {
      "refAudioPath": "./predef_ref/鹤屋/02_鹤屋_鼓励.wav",
      "promptText": "ミクルなら全然大丈夫さ。あたしはあの子の力を信じるよ。"
    },
    "tsuruya_3": {
      "refAudioPath": "./predef_ref/鹤屋/03_鹤屋_疑问_惊奇.wav",
      "promptText": "ねえどういうこと?これみんな採取記号を見に来た人たちだっての?"
    },
    "tsuruya_4": {
      "refAudioPath": "./predef_ref/鹤屋/04_鹤屋_略担心.wav",
      "promptText": "焼きそば喫茶の衣装を着たままで、なんだかすごく動転した様子だったって。"
    },
    "tsuruya_5": {
      "refAudioPath": "./predef_ref/鹤屋/05_鹤屋_平静说话.wav",
      "promptText": "外に買い出しに行ってたクラスの子が走って坂を降りていくミクルを見たんだって。"
    },
    "tsuruya_6": {
      "refAudioPath": "./predef_ref/鹤屋/06_鹤屋_担心_关心.wav",
      "promptText": "ミクル、こっちには全然姿見せてないんだって。連絡もないらしくて。"
    },
    "tsuruya_7": {
      "refAudioPath": "./predef_ref/鹤屋/07_鹤屋_热情.wav",
      "promptText": "よーしよし、力を合わせて頑張ろう!"
    },
    "tsuruya_8": {
      "refAudioPath": "./predef_ref/鹤屋/08_鹤屋_原来如此_思索.wav",
      "promptText": "なるほどねー。でもミクルがバンドかー。うん。"
    }
  },
  "defaultPromptAudio": "./predef_ref/正常有希/01_有希_平静.wav",
  "defaultPromptText": "私が再び異常動作を起こさないという確証はない。",
  "deepLApiKey": ""
}

// 富化后的内置远端角色配置（凉宫春日系列：锁定、自带端点与语气归属）
export const HARUHI_REMOTE_BUILTIN: TtsConfig = enrichBuiltinRemote(HARUHI_REMOTE)

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  { id: "haruhi-remote", name: "凉宫春日（远端服务）", config: HARUHI_REMOTE_BUILTIN },
]

export function builtinPreset(id: string): TtsConfig | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id)?.config
}

// 内置角色（凉宫春日系列）的角色名集合——用于在合并配置时锁定/识别
export function builtinRoleNames(): string[] {
  return Object.keys(HARUHI_REMOTE_BUILTIN.roleModelMapping)
}
