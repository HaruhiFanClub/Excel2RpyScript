class RpyFileWriter(object):

    @classmethod
    def write_file(cls, output_dir, res, role_name_mapping):
        output_path = output_dir + "/" + res.label + '.rpy'
        with open(output_path, 'w', encoding='utf-8') as f:
            for k, v in role_name_mapping.items():
                f.write(v.render() + "\n")
            f.write("define narrator_nvl = Character(None, kind=nvl)\n")
            f.write("define narrator_adv = Character(None, kind=adv)\n")
            f.write("\nlabel {}:\n".format(res.label))
            for rpy_element in res.data:
                f.write(rpy_element.music.render() + '\n')
                for ch in rpy_element.character:
                    f.write(ch.render() + '\n')
                f.write(rpy_element.background.render() + '\n')
                f.write(rpy_element.sound.render() + '\n')
                f.write(rpy_element.transition.render() + '\n')
                f.write(rpy_element.text.render() + '\n')
                f.write(rpy_element.change_page.render() + '\n')
