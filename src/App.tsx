import React, { useState, useEffect, useRef } from 'react';
import { ConfigProvider, theme } from 'antd';
import { useSyncExternalStore } from 'react';
import './App.css';
import { InputNumber, ColorPicker, Input, Button, Select, Splitter, Checkbox, Divider, Dropdown, Radio } from 'antd';
import { ClearOutlined, SettingOutlined, UpOutlined, DownOutlined, CopyOutlined } from '@ant-design/icons';
import type { InputNumberProps } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import type { MenuProps } from 'antd';
import type { MenuInfo } from '@rc-component/menu/lib/interface';
import { message } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface OutLine {
  content: string;
  color?: string;
  type: 'send' | 'receive';
}

interface SerialConfig {
  port: string;
  baud: number;
  data_bits: number;
  parity: 'None' | 'Odd' | 'Even';
  stop_bits: number;
  flow_control: 'None' | 'RtsCts' | 'XonXoff';
  open_status: boolean;
}
interface SerialDevice {
  name: string;
  port: string;
}

const SerialDebugger: React.FC = () => {
  const subscribe = (onStoreChange: () => void) => {
    window.addEventListener('storage', onStoreChange);
    return () => {
      window.removeEventListener('storage', onStoreChange);
    };
  };
  const getSnapshot = () => {
    const configString = localStorage.getItem('darkMode');
    return configString === 'true';
  };
  const darkMode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // 颜色选择器
  const [color, setColor] = useState<string>('#31a9ff');
  const [flow_control, setFlowControl] = useState<SerialConfig['flow_control']>('None');
  // 发送接收计数
  const [receive_count, setReceiveCount] = useState<number>(0);
  const [send_count, setSendCount] = useState<number>(0);
  // 接收显示HTML
  const [receive_text, setReceiveText] = useState<OutLine[]>([]);
  const [need_scroll, setNeedScroll] = useState<boolean>(false);
  // 自动断帧
  const last_receive_time_ref = useRef<number>(0);
  const auto_frame_ref = useRef(true);
  const auto_frame_time_ref = useRef(10);
  // 显示发送字符串
  const show_send_message_ref = useRef(false);
  // 十六进制显示
  const hex_show_ref = useRef(false);
  // 十六进制发送
  const [hex_send, setHexSend] = useState<boolean>(false);
  // 输入文本框
  const [send_data, setSendData] = useState<string>('');
  const inputRef = useRef<TextAreaRef>(null);
  // 串口列表
  const [serial_list, setSerialList] = useState<Array<SerialDevice>>([]);

  // 定时发送
  const [timerRunning, setTimerRunning] = useState(false); // 控制定时器状态
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timerInterval, setTimerInterval] = useState<number>(100000); // 定时器间隔，单位毫秒
  const sendMsgRef = useRef<() => Promise<void> | void>(() => undefined);
  const openSettings = async () => {
    await invoke('open_and_activate_window');
  }
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        void sendMsgRef.current();
      }, timerInterval);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timerRunning, timerInterval]);

  // 串口配置
  const [serial_config, setSerialConfig] = useState<SerialConfig>({
    port: '',
    baud: 9600,
    data_bits: 8,
    parity: 'None',
    stop_bits: 1,
    flow_control: 'None',
    open_status: false,
  });

  useEffect(() => {
    if (need_scroll) {
      const showSection = document.getElementById('show-section');
      if (showSection) {
        const targetTop = showSection.scrollHeight - showSection.clientHeight;
        showSection.scrollTo({
          top: targetTop,
          behavior: 'instant'
        });
      }
      setNeedScroll(false);
    }
  }, [receive_text]);
  const [messageApi, messageHolder] = message.useMessage();
  useEffect(() => {
    let unlistenDataUpdated: (() => void) | undefined;
    let unlistenSerialFailed: (() => void) | undefined;
    // let unlistenSerialError: (() => void) | undefined;

    const savedConfigString = localStorage.getItem('serialConfig');

    if (savedConfigString) {
      try {
        // 在 try 块中执行可能出错的操作
        let savedConfig = JSON.parse(savedConfigString) as SerialConfig;
        savedConfig.open_status = false;
        setSerialConfig(savedConfig);
      } catch (error) {
        console.error('解析本地配置时出错:', error);
      }
    }

    invoke('scan_serial').then((devices) => {
      let deviceList = devices as Array<SerialDevice>;
      setSerialList(deviceList);

      if (deviceList.length > 0) {
        if (deviceList.every(device => device.port !== serial_config.port)) {
          setSerialConfig((prevConfig) => {
            const nextConfig: SerialConfig = {
              ...prevConfig,
              port: deviceList[0].port,
            };
            invoke('update_config', { newConfig: nextConfig });
            return nextConfig;
          });
        }
      }
      else {
        setSerialConfig((prevConfig) => ({
          ...prevConfig,
          port: '',
        }));
      }
    });

    const setupListeners = async () => {
      unlistenDataUpdated = await listen('data-updated', (event) => {
        const data = event.payload as Array<number>;
        const frame_break = auto_frame_ref.current && Date.now() - last_receive_time_ref.current > auto_frame_time_ref.current;
        const uint8Data = new Uint8Array(data);
        const showSection = document.getElementById('show-section');
        const nowOnBottom = showSection ? (showSection.scrollTop + showSection.clientHeight + 25 >= showSection.scrollHeight) : false;
        setNeedScroll(nowOnBottom);
        setReceiveCount((prev) => prev + uint8Data.length);
        // 关闭十六进制显示
        if (!hex_show_ref.current) {
          const textDecoder = new TextDecoder();
          const decodedText = textDecoder.decode(uint8Data);
          setReceiveText((prev) => {
            if (auto_frame_ref.current && frame_break) {
              return appendReceiveLine(prev, decodedText, {
                prefixSendTag: show_send_message_ref.current,
              });
            }
            if (prev.length > 0 && prev[prev.length - 1].type === 'receive') {
              return appendReceiveLine(prev, decodedText, { mergePrevious: true });
            }
            return appendReceiveLine(prev, decodedText, {
              prefixSendTag: show_send_message_ref.current,
            });
          });
        }
        // 开启十六进制显示
        else {
          const hexString = Array.from(uint8Data)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(' ').toUpperCase();
          setReceiveText((prev) => {
            if (auto_frame_ref.current && frame_break) {
              return appendReceiveLine(prev, hexString, {
                prefixSendTag: show_send_message_ref.current,
              });
            }
            if (prev.length > 0 && prev[prev.length - 1].type === 'receive') {
              return appendReceiveLine(prev, hexString, {
                mergePrevious: true,
                separator: ' ',
              });
            }
            return appendReceiveLine(prev, hexString, { prefixSendTag: true });
          });
        };
        if (auto_frame_ref.current) {
          last_receive_time_ref.current = Date.now();
        }
      });

      unlistenSerialFailed = await listen('serial-failed', (event) => {
        const errorMessage = event.payload as string;
        setSerialConfig((prevConfig) => ({
          ...prevConfig,
          open_status: false, // 连接失败时将状态设置为未打开
        }));
        messageApi.error(`串口错误: ${errorMessage}`);
      });
    };

    setupListeners();

    return () => {
      if (unlistenDataUpdated) {
        unlistenDataUpdated();
      }
      if (unlistenSerialFailed) {
        unlistenSerialFailed();
      }
    };
  }, []);

  const formatter: InputNumberProps<number>['formatter'] = (value) => {
    if (value === undefined || value === null) return '0.0';
    const formattedValue = (value / 10).toFixed(1);
    return `${formattedValue}`;
  };

  const appendReceiveLine = (
    prev: OutLine[],
    content: string,
    options?: {
      mergePrevious?: boolean;
      separator?: string;
      prefixSendTag?: boolean;
    }
  ): OutLine[] => {
    const { mergePrevious = false, separator = '', prefixSendTag = false } = options ?? {};

    if (mergePrevious && prev.length > 0 && prev[prev.length - 1].type === 'receive') {
      const lastLine = prev[prev.length - 1];
      return [
        ...prev.slice(0, -1),
        {
          ...lastLine,
          content: lastLine.content + separator + content,
        },
      ];
    }

    return [
      ...prev,
      {
        content: `${prefixSendTag ? '> ' : ''}${content}`,
        type: 'receive' as const,
      },
    ];
  };

  const send_message_display = (msg: string) => {
    if (serial_config.open_status) {
      setReceiveText((prev) => [...prev, { content: '< ' + msg, color: color, type: 'send' }]);
      setNeedScroll(true);
    }
  };

  const clean_output = () => {
    setReceiveText([]);
    setReceiveCount(0);
    setSendCount(0);
  };

  const open_serial = async () => {
    if (serial_list.some(device => device.port === serial_config.port)) {
      const nextConfig = {
        ...serial_config,
        open_status: !serial_config.open_status,
      };
      setSerialConfig(nextConfig);
      await invoke('update_config', { newConfig: nextConfig });
    }
  };

  const scan_serial = async () => {
    await invoke('scan_serial').then((devices) => {
      setSerialList(devices as Array<SerialDevice>);
    });
  };

  const config_change = async <K extends keyof SerialConfig>(key: K, value: SerialConfig[K]) => {
    const nextConfig = {
      ...serial_config,
      [key]: value,
    };
    localStorage.setItem('serialConfig', JSON.stringify(nextConfig));
    setSerialConfig(nextConfig);
    if (serial_config.open_status)
      await invoke('update_config', { newConfig: nextConfig });
  };

  const input_change = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (hex_send) {
      const originalValue = e.target.value;
      const cursorPosition = e.target.selectionStart;

      const cleanedValue = originalValue
        .toUpperCase()
        .replace(/[^0-9A-F]/g, '');

      const formattedValue = cleanedValue.replace(/(.{2})/g, '$1 ').trimEnd();

      // 逻辑：计算光标前的有效字符数量，推算出格式化后的新索引
      const originalTextBeforeCursor = originalValue.slice(0, cursorPosition);
      const cleanTextBeforeCursor = originalTextBeforeCursor.toUpperCase().replace(/[^0-9A-F]/g, '');

      let newCursorPos = 0;
      const charCount = cleanTextBeforeCursor.length;

      if (charCount === 0) {
        newCursorPos = 0;
      } else {
        // 每2个字符多1个空格，所以空格数量是 Math.floor((charCount - 1) / 2)
        const spaceCount = Math.floor((charCount - 1) / 2);
        newCursorPos = charCount + spaceCount;
      }

      setSendData(formattedValue);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.resizableTextArea?.textArea.setSelectionRange;

          const finalPos = Math.min(newCursorPos, formattedValue.length);
          inputRef.current?.resizableTextArea?.textArea.setSelectionRange(finalPos, finalPos);
        }
      }, 0);
    }
    else
      setSendData(e.target.value);
  };

  const hex_send_change = (e: CheckboxChangeEvent) => {
    setHexSend(e.target.checked);
    if (!e.target.checked) {
      let hexString = send_data.replace(/\s+/g, '');
      if (hexString.length % 2 !== 0) {
        hexString = hexString.slice(0, -1) + '0' + hexString.slice(-1);
      }
      if (hexString.length === 0) return;
      const bytes = [];
      for (let i = 0; i < hexString.length; i += 2) {
        const byteVal = parseInt(hexString.slice(i, i + 2), 16);
        // 如果解析失败（如包含非 Hex 字符），填入 0 或跳过
        bytes.push(isNaN(byteVal) ? 0 : byteVal);
      }
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const uint8Array = new Uint8Array(bytes);
      let decodedString = decoder.decode(uint8Array);
      setSendData(decodedString.replace(/\uFFFD/g, ' '));
    }
    else {
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(send_data);
      const hexString = Array.from(uint8Array)
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      setSendData(hexString);
    }
  };

  const send_msg = async () => {
    if (!serial_config.open_status || send_data.length === 0) {
      return;
    }
    if (!hex_send) {
      let data = new TextEncoder().encode(send_data);
      if (show_send_message_ref.current && data.length > 0) {
        send_message_display(send_data);
      }
      if (serial_config.open_status)
        setSendCount((prev) => prev + data.length);
      await invoke('send_msg', { msg: data });
    }
    else {
      const hexString = send_data.replace(/\s+/g, '');
      const bytes = [];
      for (let i = 0; i < hexString.length; i += 2) {
        const byteVal = parseInt(hexString.slice(i, i + 2), 16);
        bytes.push(isNaN(byteVal) ? 0 : byteVal);
      }
      const uint8Array = new Uint8Array(bytes);
      if (show_send_message_ref.current) {

        if (hexString.length % 2 !== 0) {
          const displayString = (send_data.slice(0, -1) + '0' + send_data.slice(-1));
          send_message_display(displayString);
        }
        else {
          const displayString = send_data;
          send_message_display(displayString);
        }
      }
      if (serial_config.open_status)
        setSendCount((prev) => prev + uint8Array.length);
      await invoke('send_msg', { msg: uint8Array });
    }
  };

  useEffect(() => {
    sendMsgRef.current = send_msg;
  }, [send_msg]);

  const [secMenuOpen, setSecMenuOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectedBool, setSelectedBool] = useState(false);
  const copySelectedText = async () => {
    if (selectedText.length > 0) {
      await navigator.clipboard.writeText(selectedText);
    }
  }

  const copyAllText = async () => {
    const allText = receive_text.map(line => line.content).join('\n');
    if (allText.length > 0) {
      await navigator.clipboard.writeText(allText);
    }
  }

  const copyLineText = async (line: number) => {
    const lineContent = receive_text[line]?.content || '';
    if (lineContent.length > 0) {
      await navigator.clipboard.writeText(lineContent);
    }
  }

  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);

  const collapseHandler = (collapsed: boolean[], _sizes: number[]) => {
    setLeftPanelCollapsed(Boolean(collapsed[0]));
  }

  const copyToSendArea = () => {
    if (selectedText.length > 3) {
      let textToCopy = selectedText.trim();
      const regex = /^[0-9A-F]{2}(?: [0-9A-F]{2})*$/;
      setHexSend(regex.test(textToCopy));
      setSendData(textToCopy);
    }
    else
      setSendData(selectedText);
  }

  const secMenu: MenuProps['items'] = [{
    key: 'clear',
    label: '清空',
    icon: <ClearOutlined />,
    onClick: clean_output
  },
  {
    type: 'divider',
  }, {
    key: 'copy_all',
    label: '复制全部',
    icon: <CopyOutlined />,
    onClick: copyAllText,
  },
  ];

  const handleMenuClick = (info: MenuInfo, index: number) => {
    if (info.key === 'copy') {
      copySelectedText();
    }
    else if (info.key === 'copy_to') {
      copyToSendArea();
    }
    else if (info.key === 'copy_line') {
      copyLineText(index);
    }
    else if (info.key === 'clear') {
      clean_output();
    }
    else if (info.key === 'copy_all') {
      copyAllText();
    }
  };
  const logMenu: MenuProps['items'] = [{
    key: 'copy',
    label: '复制',
    icon: <CopyOutlined />,
    disabled: !selectedBool,
  },
  {
    key: 'copy_to',
    label: '复制到发送栏',
    icon: <CopyOutlined />,
    disabled: !selectedBool
  },
  {
    key: 'copy_line',
    label: '复制本行',
    icon: <CopyOutlined />
  },
  {
    key: 'copy_all',
    label: '复制全部',
    icon: <CopyOutlined />,
  },
  {
    type: 'divider',
  },
  {
    key: 'clear',
    label: '清空',
    icon: <ClearOutlined />,
  },
  ];
  return (
    <ConfigProvider
      theme={{
        algorithm: darkMode ? theme.darkAlgorithm : undefined
      }}>
      <div className="main-container">
        <Splitter onCollapse={collapseHandler} >
          <Splitter.Panel className={`left-splitter ${leftPanelCollapsed ? 'collapsed' : ''}`} min={200} defaultSize={200} collapsible={{ start: true, end: true, showCollapsibleIcon: true }}>
            <div className='left-section'>
              <div className="row" style={{ paddingTop: "10px" }}>
                <label className="label">端口名</label>
                <Select<string>
                  className="select"
                  value={serial_config.port}
                  options={serial_list.map((device) => ({
                    value: device.port,
                    label: `${device.port}-${device.name}`,
                  }))}
                  onChange={(value) => config_change('port', value)}
                  onOpenChange={scan_serial}
                />
              </div>

              <div className="row">
                <label className="label">波特率</label>
                <Select<number>
                  value={serial_config.baud}
                  onChange={(value) => config_change('baud', value)}
                  className="select"
                  options={[
                    { value: 300, label: '300' },
                    { value: 600, label: '600' },
                    { value: 1200, label: '1,200' },
                    { value: 2400, label: '2,400' },
                    { value: 4800, label: '4,800' },
                    { value: 9600, label: '9,600' },
                    { value: 19200, label: '19,200' },
                    { value: 38400, label: '38,400' },
                    { value: 57600, label: '57,600' },
                    { value: 115200, label: '115,200' },
                    { value: 128000, label: '128,000' },
                    { value: 230400, label: '230,400' },
                    { value: 256000, label: '256,000' },
                    { value: 460800, label: '460,800' },
                    { value: 921600, label: '921,600' },
                    { value: 1000000, label: '1,000,000' },
                    { value: 1500000, label: '1,500,000' },
                    { value: 2000000, label: '2,000,000' },
                  ]}
                />
              </div>

              <div className="row">
                <label className="label">数据位</label>
                <Select<number>
                  value={serial_config.data_bits}
                  onChange={(value) => config_change('data_bits', value)}
                  className="select"
                  options={[
                    { value: 5, label: '5' },
                    { value: 6, label: '6' },
                    { value: 7, label: '7' },
                    { value: 8, label: '8' },
                  ]}
                />
              </div>

              <div className="row">
                <label className="label">校验位</label>
                <Select<SerialConfig['parity']>
                  value={serial_config.parity}
                  onChange={(value) => config_change('parity', value)}
                  className="select"
                  options={[
                    { value: 'None', label: 'None' },
                    { value: 'Odd', label: 'Odd' },
                    { value: 'Even', label: 'Even' },
                  ]}
                />
              </div>

              <div className="row">
                <label className="label">停止位</label>
                <Select<number>
                  value={serial_config.stop_bits}
                  onChange={(value) => config_change('stop_bits', value)}
                  className="select"
                  options={[
                    { value: 1, label: '1' },
                    { value: 2, label: '2' },
                  ]}
                />
              </div>
              <div className="button-row">
                <Radio.Group size="small" buttonStyle="solid" block value={flow_control} onChange={(e) => { setFlowControl(e.target.value); config_change('flow_control', e.target.value) }}>
                  <Radio.Button value="None" >关闭</Radio.Button>
                  <Radio.Button value="RtsCts" >RtsCts</Radio.Button>
                  <Radio.Button value="XonXoff" >XonXoff</Radio.Button>
                </Radio.Group>
              </div>

              <div className="open-row">
                <Button className="open-button" color={serial_config.open_status ? 'red' : 'blue'} variant="solid" onClick={open_serial}>
                  {serial_config.open_status ? '关闭' : '打开'}
                </Button>
              </div>

              <Divider size="small" />

              <div>
                <h3 className="serial-debugger__section-title">接收设置</h3>
              </div>
              <div className="checkbox-row">
                <Checkbox onChange={(e) => { hex_show_ref.current = e.target.checked }}>
                  十六进制显示
                </Checkbox>
              </div>
              <div className="checkbox_withinput-row">
                <Checkbox defaultChecked onChange={(e) => { auto_frame_ref.current = e.target.checked }}>
                  自动断帧(ms)
                </Checkbox>
                <InputNumber<number>
                  min={1}
                  size="small"
                  defaultValue={10}
                  parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                  changeOnWheel
                  onChange={(value) => { auto_frame_time_ref.current = value || 10 }}
                />
              </div>

              <Divider size="small" />

              <div>
                <h3 className="serial-debugger__section-title">发送设置</h3>
              </div>
              <div className="checkbox-row">
                <Checkbox checked={hex_send} onChange={hex_send_change}>
                  十六进制发送
                </Checkbox>
              </div>
              <div className="checkbox_withinput-row">
                <Checkbox value={timerRunning} onChange={(e) => setTimerRunning(e.target.checked)}>
                  定时发送(s)
                </Checkbox>
                <InputNumber<number>
                  min={1}
                  size="small"
                  defaultValue={1000}
                  formatter={formatter}
                  parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number * 10}
                  onChange={(value) => { setTimerInterval((value || 1000) * 100); }}
                  changeOnWheel
                />
              </div>
              <div className="checkbox-row">
                <Checkbox onChange={(e) => { show_send_message_ref.current = e.target.checked }}>
                  显示发送字符串
                </Checkbox>
                <ColorPicker
                  value={color}
                  onChange={(color) => setColor(color.toHexString())}
                  style={{ margin: '-10px 0 0 0' }}
                  size="small"
                  format="hex"
                  disabledFormat
                  disabledAlpha
                  presets={[
                    {
                      label: '常用颜色',
                      colors: [
                        // 黑色系 (4种) - 反转
                        '#000000', // 纯黑
                        '#424242', // 深灰
                        '#9E9E9E', // 中浅灰
                        '#FFFFFF', // 纯白

                        // 红色系 (4种) - 反转
                        '#C62828', // 暗红
                        '#F44336', // 正红

                        // 橙色系 (4种) - 反转
                        '#EF6C00', // 暗橙
                        '#FF9800', // 正橙

                        // 黄色系 (4种) - 反转
                        '#F9A825', // 暗黄
                        '#FFEB3B', // 正黄

                        // 绿色系 (4种) - 反转
                        '#2E7D32', // 暗绿
                        '#4CAF50', // 正绿

                        // 蓝色系 (4种) - 反转
                        '#1565C0', // 暗蓝
                        '#2196F3', // 正蓝

                        // 紫色系 (4种) - 反转
                        '#6A1B9A', // 暗紫
                        '#9C27B0', // 正紫
                      ],
                    },
                  ]}
                />
              </div>
              {/* <div className="checkbox-row">
              <Checkbox>自动重连</Checkbox>
            </div> */}
              <div style={{ height: "30px" }}></div>
            </div>
            <div className="bottom-bar">
              <div className='inner-icon' onClick={clean_output}>
                <ClearOutlined className='icon clear-icon' />
              </div>
              <div className='inner-icon' onClick={openSettings}>
                <SettingOutlined className='icon setting-icon' />
              </div>
            </div>
          </Splitter.Panel>

          <Splitter.Panel>
            <div className="right-splitter">
              {messageHolder}
              <Dropdown menu={{ items: secMenu }} trigger={['contextMenu']} open={secMenuOpen} onOpenChange={(open) => setSecMenuOpen(open)}>
                <div className="show-section" id="show-section">
                  {receive_text.map((logLine, index) => {
                    return (
                      <Dropdown key={index} menu={{ items: logMenu, onClick: (e) => handleMenuClick(e, index) }} trigger={['contextMenu']}>
                        <div
                          key={index}
                          style={{
                            color: logLine.color,
                            wordBreak: 'break-all'
                          }}
                          onContextMenu={(e) => {
                            e.stopPropagation(); setSecMenuOpen(false);
                            let selection = window.getSelection()?.toString() || '';
                            setSelectedText(selection);
                            setSelectedBool(selection.length > 0);
                          }
                          }
                        >
                          {logLine.content}
                        </div>
                      </Dropdown>
                    );
                  })}
                </div>
              </Dropdown>
              <div className="send-section">
                <div className="text-section">
                  <Input.TextArea
                    ref={inputRef}
                    autoSize={{ minRows: 5, maxRows: 5 }}
                    value={send_data}
                    onChange={input_change}
                    className="text-area"
                    placeholder="请输入文本..."
                  />
                  <div className="send-button-container">
                    <Button className="send-button"
                      onClick={send_msg}
                    >
                      发送
                    </Button>
                  </div>
                </div>
              </div>
              <div className="log-section">
                <UpOutlined />
                &nbsp;发送:{send_count}
                &nbsp;&nbsp;|
                &nbsp;<DownOutlined />
                &nbsp;接收:{receive_count}
              </div>
            </div>
          </Splitter.Panel >
        </Splitter >
      </div >
    </ConfigProvider>
  );
};

export default SerialDebugger;