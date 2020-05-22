################################################################################
## 初始化
################################################################################

## “init offset”语句可使此文件中的初始化语句在任何其他文件中的“init”语句之前运
## 行。
init offset = -2

## 调用gui.init会将样式重置为合理的默认值，并设置游戏的宽度和高度（分辨率）。
init python:
    gui.init(1280, 720)



################################################################################
## GUI配置变量
################################################################################


## 颜色 ##########################################################################
##
## 界面中文本的颜色。

## 整个界面中使用的强调色，用于标记和突出显示文本。
define gui.accent_color = '#0099cc'

## 当既未选中也未悬停时用于文本按钮的颜色。
define gui.idle_color = '#888888'

## 小颜色用于小文本，需要更亮/更暗才能达到相同的效果。
define gui.idle_small_color = '#aaaaaa'

## 用于悬停的按钮和滑条的颜色。
define gui.hover_color = '#66c1e0'

## 用于选中但非焦点的文本按钮的颜色。当一个按钮为当前屏幕或设置选项值时，会处于
## 选中状态。
define gui.selected_color = '#ffffff'

## 用于无法选择的文本按钮的颜色。
define gui.insensitive_color = '#8888887f'

## 用于未填充的滑条部分的颜色。这些颜色不直接使用，但在重新生成条形图像文件时使
## 用。
define gui.muted_color = '#003d51'
define gui.hover_muted_color = '#005b7a'

## 用于对话和菜单选择文本的颜色。
define gui.text_color = '#ffffff'
define gui.interface_text_color = '#ffffff'


## 字体和字体大小 #####################################################################

## 用于游戏内文本的字体。
define gui.text_font = "SourceHanSans-Light-Lite.ttf"

## 用于角色名称的字体。
define gui.name_text_font = "SourceHanSans-Light-Lite.ttf"

## 用于游戏外文本的字体。
define gui.interface_text_font = "SourceHanSans-Light-Lite.ttf"

## 普通对话文本的大小。
define gui.text_size = 22

## 角色名称的大小。
define gui.name_text_size = 30

## 游戏用户界面中文本的大小。
define gui.interface_text_size = 22

## 游戏用户界面中标签的大小。
define gui.label_text_size = 24

## 通知屏幕上文本的大小。
define gui.notify_text_size = 16

## 游戏标题的大小。
define gui.title_text_size = 50


## 标题和游戏菜单 #####################################################################

## 用于标题菜单和游戏菜单的图像。
define gui.main_menu_background = "gui/main_menu.png"
define gui.game_menu_background = "gui/game_menu.png"


## 对话 ##########################################################################
##
## 这些变量控制对话框一次一行显示在屏幕上的方式。

## 包含对话的文本框的高度。
define gui.textbox_height = 185

## 文本框在屏幕上的垂直位置。0.0 是顶部，0.5 是正中，1.0 是底部。
define gui.textbox_yalign = 1.0


## 叙述角色名称相对文本框的位置。可以是从左侧或顶部起的整数像素，或设为“0.5”来放
## 置到正中。
define gui.name_xpos = 240
define gui.name_ypos = 0

## 角色名称的水平对齐方式。0.0 为左侧对齐，0.5 为居中显示，而 1.0 为右侧对齐。
define gui.name_xalign = 0.0

## 包含角色名称的框的宽度，高度和边界尺寸，或设为“None”以自动调整其大小。
define gui.namebox_width = None
define gui.namebox_height = None

## 包含角色名称的框的边界尺寸，以左、上、右、下顺序排列。
define gui.namebox_borders = Borders(5, 5, 5, 5)

## 若为True，则名称框的背景将被平铺；若为False，则将缩放名称框的背景。
define gui.namebox_tile = False


## 对话框相对于文本框的位置。可以是相对于文本框从左侧或顶部起的整数像素，或设
## 为“0.5”来放置到正中。
define gui.dialogue_xpos = 268
define gui.dialogue_ypos = 50

## 对话文本的最大宽度（以像素为单位）。
define gui.dialogue_width = 744

## 对话文本的水平对齐方式。0.0 为左侧对齐，0.5 为居中显示，而 1.0 为右侧对齐。
define gui.dialogue_text_xalign = 0.0


## 按钮 ##########################################################################
##
## These variables, along with the image files in gui/button, control aspects of
## how buttons are displayed.

## The width and height of a button, in pixels. If None, Ren'Py computes a size.
define gui.button_width = None
define gui.button_height = None

## The borders on each side of the button, in left, top, right, bottom order.
define gui.button_borders = Borders(4, 4, 4, 4)

## If True, the background image will be tiled. If False, the background image
## will be linearly scaled.
define gui.button_tile = False

## 按钮使用的字体。
define gui.button_text_font = gui.interface_text_font

## 按钮所使用的文本大小。
define gui.button_text_size = gui.interface_text_size

## The color of button text in various states.
define gui.button_text_idle_color = gui.idle_color
define gui.button_text_hover_color = gui.hover_color
define gui.button_text_selected_color = gui.selected_color
define gui.button_text_insensitive_color = gui.insensitive_color

## 按钮文本的水平对齐方式。（0.0 为左对齐，0.5 为居中显示，1.0 为右对齐）。
define gui.button_text_xalign = 0.0


## These variables override settings for different kinds of buttons. Please see
## the gui documentation for the kinds of buttons available, and what each is
## used for.
##
## These customizations are used by the default interface:

define gui.radio_button_borders = Borders(18, 4, 4, 4)

define gui.check_button_borders = Borders(18, 4, 4, 4)

define gui.confirm_button_text_xalign = 0.5

define gui.page_button_borders = Borders(10, 4, 10, 4)

define gui.quick_button_borders = Borders(10, 4, 10, 0)
define gui.quick_button_text_size = 14
define gui.quick_button_text_idle_color = gui.idle_small_color
define gui.quick_button_text_selected_color = gui.accent_color

## You can also add your own customizations, by adding properly-named variables.
## For example, you can uncomment the following line to set the width of a
## navigation button.

# define gui.navigation_button_width = 250


## 选项按钮 ########################################################################
##
## 用于游戏内菜单的选项按钮。

define gui.choice_button_width = 790
define gui.choice_button_height = None
define gui.choice_button_tile = False
define gui.choice_button_borders = Borders(100, 5, 100, 5)
define gui.choice_button_text_font = gui.text_font
define gui.choice_button_text_size = gui.text_size
define gui.choice_button_text_xalign = 0.5
define gui.choice_button_text_idle_color = "#cccccc"
define gui.choice_button_text_hover_color = "#ffffff"
define gui.choice_button_text_insensitive_color = "#444444"


## 存档按钮 ########################################################################
##
## A file slot button is a special kind of button. It contains a thumbnail
## image, and text describing the contents of the save slot. A save slot uses
## image files in gui/button, like the other kinds of buttons.

## 存档位按钮。
define gui.slot_button_width = 276
define gui.slot_button_height = 206
define gui.slot_button_borders = Borders(10, 10, 10, 10)
define gui.slot_button_text_size = 14
define gui.slot_button_text_xalign = 0.5
define gui.slot_button_text_idle_color = gui.idle_small_color
define gui.slot_button_text_selected_idle_color = gui.selected_color
define gui.slot_button_text_selected_hover_color = gui.hover_color

## The width and height of thumbnails used by the save slots.
define config.thumbnail_width = 256
define config.thumbnail_height = 144

## The number of columns and rows in the grid of save slots.
define gui.file_slot_cols = 3
define gui.file_slot_rows = 2


## Positioning and Spacing #####################################################
##
## These variables control the positioning and spacing of various user interface
## elements.

## The position of the left side of the navigation buttons, relative to the left
## side of the screen.
define gui.navigation_xpos = 40

## The vertical position of the skip indicator.
define gui.skip_ypos = 10

## The vertical position of the notify screen.
define gui.notify_ypos = 45

## The spacing between menu choices.
define gui.choice_spacing = 22

## Buttons in the navigation section of the main and game menus.
define gui.navigation_spacing = 4

## Controls the amount of spacing between preferences.
define gui.pref_spacing = 10

## Controls the amount of spacing between preference buttons.
define gui.pref_button_spacing = 0

## The spacing between file page buttons.
define gui.page_spacing = 0

## The spacing between file slots.
define gui.slot_spacing = 10

## 标题菜单文本的位置。
define gui.main_menu_text_xalign = 1.0


## Frames ######################################################################
##
## These variables control the look of frames that can contain user interface
## components when an overlay or window is not present.

## Generic frames.
define gui.frame_borders = Borders(4, 4, 4, 4)

## The frame that is used as part of the confirm screen.
define gui.confirm_frame_borders = Borders(40, 40, 40, 40)

## The frame that is used as part of the skip screen.
define gui.skip_frame_borders = Borders(16, 5, 50, 5)

## The frame that is used as part of the notify screen.
define gui.notify_frame_borders = Borders(16, 5, 40, 5)

## Should frame backgrounds be tiled?
define gui.frame_tile = False


## Bars, Scrollbars, and Sliders ###############################################
##
## These control the look and size of bars, scrollbars, and sliders.
##
## The default GUI only uses sliders and vertical scrollbars. All of the other
## bars are only used in creator-written screens.

## The height of horizontal bars, scrollbars, and sliders. The width of vertical
## bars, scrollbars, and sliders.
define gui.bar_size = 25
define gui.scrollbar_size = 12
define gui.slider_size = 25

## True if bar images should be tiled. False if they should be linearly scaled.
define gui.bar_tile = False
define gui.scrollbar_tile = False
define gui.slider_tile = False

## Horizontal borders.
define gui.bar_borders = Borders(4, 4, 4, 4)
define gui.scrollbar_borders = Borders(4, 4, 4, 4)
define gui.slider_borders = Borders(4, 4, 4, 4)

## Vertical borders.
define gui.vbar_borders = Borders(4, 4, 4, 4)
define gui.vscrollbar_borders = Borders(4, 4, 4, 4)
define gui.vslider_borders = Borders(4, 4, 4, 4)

## What to do with unscrollable scrollbars in the gui. "hide" hides them, while
## None shows them.
define gui.unscrollable = "hide"


## 历史 ##########################################################################
##
## 历史记录屏幕显示玩家已经阅读过的对话。

## Ren'Py 将保留的对话历史块数。
define config.history_length = 250

## 历史屏幕条目的高度，或设置为“None”以使高度变量自适应。
define gui.history_height = 140

## 所指定叙述角色的标签的坐标、宽度和对齐方式。
define gui.history_name_xpos = 155
define gui.history_name_ypos = 0
define gui.history_name_width = 155
define gui.history_name_xalign = 1.0

## 对话文本的坐标、宽度和对齐方式。
define gui.history_text_xpos = 170
define gui.history_text_ypos = 2
define gui.history_text_width = 740
define gui.history_text_xalign = 0.0


## NVL 模式 ######################################################################
##
## NVL 模式屏幕显示 NVL 模式的角色所产生的对话。

## The borders of the background of the NVL-mode background window.
define gui.nvl_borders = Borders(0, 10, 0, 20)

## The maximum number of NVL-mode entries Ren'Py will display. When more entries
## than this are to be show, the oldest entry will be removed.
define gui.nvl_list_length = 6

## The height of an NVL-mode entry. Set this to None to have the entries
## dynamically adjust height.
define gui.nvl_height = 115

## The spacing between NVL-mode entries when gui.nvl_height is None, and between
## NVL-mode entries and an NVL-mode menu.
define gui.nvl_spacing = 10

## 所指定叙述角色的标签的坐标、宽度和对齐方式。
define gui.nvl_name_xpos = 430
define gui.nvl_name_ypos = 0
define gui.nvl_name_width = 150
define gui.nvl_name_xalign = 1.0

## 对话文本的坐标、宽度和对齐方式。
define gui.nvl_text_xpos = 450
define gui.nvl_text_ypos = 8
define gui.nvl_text_width = 590
define gui.nvl_text_xalign = 0.0

## The position, width, and alignment of nvl_thought text (the text said by the
## nvl_narrator character.)
define gui.nvl_thought_xpos = 240
define gui.nvl_thought_ypos = 0
define gui.nvl_thought_width = 780
define gui.nvl_thought_xalign = 0.0

## The position of nvl menu_buttons.
define gui.nvl_button_xpos = 450
define gui.nvl_button_xalign = 0.0

## 本地化 #########################################################################

## 该变量控制允许在何时换行。默认值适用于大多数语言。可用的值请参见 https://
## www.renpy.org/doc/html/style_properties.html#style-property-language

define gui.language = "unicode"


################################################################################
## 移动设备
################################################################################

init python:

    ## 该变量增加快捷菜单按钮的尺寸来使它们在平板和手机上更容易按到。
    if renpy.variant("touch"):

        gui.quick_button_borders = Borders(40, 14, 40, 0)

    ## 该变量更改各个 GUI 元素的尺寸和间距来确保它们在手机上更容易识别。
    if renpy.variant("small"):

        ## 字体大小。
        gui.text_size = 30
        gui.name_text_size = 36
        gui.notify_text_size = 25
        gui.interface_text_size = 30
        gui.button_text_size = 30
        gui.label_text_size = 34

        ## 调整对话框的位置。
        gui.textbox_height = 240
        gui.name_xpos = 80
        gui.text_xpos = 90
        gui.text_width = 1100

        ## 更改各元素的尺寸和间距。
        gui.slider_size = 36

        gui.choice_button_width = 1240

        gui.navigation_spacing = 20
        gui.pref_button_spacing = 10

        gui.history_height = 190
        gui.history_text_width = 690

        gui.quick_button_text_size = 20

        ## 文件按钮布局。
        gui.file_slot_cols = 2
        gui.file_slot_rows = 2

        ## NVL 模式。
        gui.nvl_height = 170

        gui.nvl_name_width = 305
        gui.nvl_name_xpos = 325

        gui.nvl_text_width = 915
        gui.nvl_text_xpos = 345
        gui.nvl_text_ypos = 5

        gui.nvl_thought_width = 1240
        gui.nvl_thought_xpos = 20

        gui.nvl_button_width = 1240
        gui.nvl_button_xpos = 20



