#!/usr/bin/env python
# -*- coding:utf-8 -*-
MENU_TEMPLATE = "    \"{label}\":\n        jump {target}\n"
SIDE_CHARACTER_TEMPLATE = "image side {role_name} = \"{path}\"\n"


class RpyFileWriter(object):

    @classmethod
    def write_file(cls, output_dir, res, role_name_mapping, role_side_character_mapping):
        output_path = output_dir + "/" + res.label + '.rpy'
        with open(output_path, 'w', encoding='utf-8') as f:
            for k, v in role_name_mapping.items():
                f.write(v.render() + "\n")
            f.write("define narrator_nvl = Character(None, kind=nvl)\n")
            f.write("define narrator_adv = Character(None, kind=adv)\n")
            f.write("define config.voice_filename_format = \"audio/{filename}\"\n")
            for k, v in role_side_character_mapping.items():
                f.write(SIDE_CHARACTER_TEMPLATE.format(role_name=k, path=v))
            f.write("\nlabel {}:\n".format(res.label))
            last_voice = None
            current_menus = []
            for rpy_element in res.data:
                if rpy_element.menu:
                    current_menus.append(rpy_element.menu)
                    continue
                if current_menus:
                    f.write("menu:\n" + "\n".join(
                        [MENU_TEMPLATE.format(label=m.label, target=m.target) for m in current_menus]))
                    current_menus.clear()
                    continue
                if rpy_element.music:
                    f.write(rpy_element.music.render() + '\n')
                if rpy_element.character:
                    for ch in rpy_element.character:
                        f.write(ch.render() + '\n')
                if rpy_element.background:
                    f.write(rpy_element.background.render() + '\n')
                if rpy_element.sound:
                    f.write(rpy_element.sound.render() + '\n')
                if rpy_element.transition:
                    f.write(rpy_element.transition.render() + '\n')
                if rpy_element.voice:
                    f.write(rpy_element.voice.render() + '\n')
                if rpy_element.text:
                    if last_voice and last_voice.sustain:
                        f.write("voice sustain\n")
                    f.write(rpy_element.text.render() + '\n')
                if rpy_element.change_page:
                    f.write(rpy_element.change_page.render() + '\n')
                last_voice = rpy_element.voice
            if current_menus:
                # fix menu在最后一行
                f.write("menu:\n" + "\n".join(
                    [MENU_TEMPLATE.format(label=m.label, target=m.target) for m in current_menus]))