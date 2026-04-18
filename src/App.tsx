import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { InputNumber, ColorPicker, Input, Button, Select, Splitter, Checkbox, Divider } from 'antd';
import { ShrinkOutlined, ToTopOutlined, ClearOutlined, SettingOutlined } from '@ant-design/icons';
import type { InputNumberProps } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import { message } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// 自定义组件类型定义
interface SerialDebuggerProps {
  // 可以添加props定义
}

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
  dtr_enable: boolean;
  rts_enable: boolean;
  open_status: boolean;
}
interface SerialDevice {
  name: string;
  port: string;
}

const SerialDebugger: React.FC<SerialDebuggerProps> = () => {
  // 颜色选择器
  const [color, setColor] = useState<string>('#31a9ff');
  // 接收显示HTML
  const [receive_text, setReceiveText] = useState<OutLine[]>([]);
  const [need_scroll, setNeedScroll] = useState<boolean>(false);
  // 自动断帧
  const [auto_frame, setAutoFrame] = useState<boolean>(false);
  // 显示发送字符串
  const [show_send_message, setShowSendMessage] = useState<boolean>(false);
  const show_send_message_ref = useRef(show_send_message);
  // 十六进制显示
  const [hex_show, setHexShow] = useState<boolean>(false);
  const hex_show_ref = useRef(hex_show);
  // 十六进制发送
  const [hex_send, setHexSend] = useState<boolean>(false);
  // 输入文本框
  const [send_data, setSendData] = useState<string>('');
  const inputRef = useRef<TextAreaRef>(null);
  // 串口列表
  const [serial_list, setSerialList] = useState<Array<SerialDevice>>([]);
  // 串口配置
  const [serial_config, setSerialConfig] = useState<SerialConfig>({
    port: '',
    baud: 9600,
    data_bits: 8,
    parity: 'None',
    stop_bits: 1,
    dtr_enable: false,
    rts_enable: false,
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

    invoke('scan_serial').then((devices) => {
      let deviceList = devices as Array<SerialDevice>;
      setSerialList(deviceList);

      if (deviceList.length > 0) {
        setSerialConfig((prevConfig) => {
          const nextConfig: SerialConfig = {
            ...prevConfig,
            port: deviceList[0].port,
          };
          invoke('update_config', { newConfig: nextConfig });
          return nextConfig;
        });
      }
    });

    const setupListeners = async () => {
      unlistenDataUpdated = await listen('data-updated', (event) => {
        const data = event.payload as Array<number>;
        const uint8Data = new Uint8Array(data);
        const showSection = document.getElementById('show-section');
        const nowOnBottom = showSection ? (showSection.scrollTop + showSection.clientHeight + 25 >= showSection.scrollHeight) : false;
        setNeedScroll(nowOnBottom);
        // 关闭十六进制显示
        if (!hex_show_ref.current) {
          const textDecoder = new TextDecoder();
          const decodedText = textDecoder.decode(uint8Data);
          setReceiveText((prev) => {
            // 如果上一行也是接收数据，则追加到上一行，否则新起一行
            if (prev.length > 0 && prev[prev.length - 1].type === 'receive') {
              prev[prev.length - 1].content += decodedText;
              return [...prev];
            }
            // 如果上一行不是接收数据但存在内容，则新起一行
            else if (prev.length > 0) {
              console.log('show_send_message_ref.current', show_send_message_ref.current);
              if (show_send_message_ref.current)
                return [...prev, { content: '> ' + decodedText, type: 'receive' }];
              else
                return [...prev, { content: decodedText, type: 'receive' }];
            }
            // 如果没有任何内容，直接添加
            else
              return [{ content: decodedText, type: 'receive' }];
          });

        }
        // 开启十六进制显示
        else {
          const hexString = Array.from(uint8Data)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(' ').toUpperCase();
          setReceiveText((prev) => {
            // 如果上一行也是接收数据，则追加到上一行，否则新起一行
            if (prev.length > 0 && prev[prev.length - 1].type === 'receive') {
              prev[prev.length - 1].content += ' ' + hexString;
              return [...prev];
            }
            else {
              return [...prev, { content: '> ' + hexString, type: 'receive' }];
            }
          });
        };
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
  const clean_output = () => {
    setReceiveText([]);
  }
  const open_serial = async () => {
    if (serial_list.some(device => device.port === serial_config.port)) {
      const nextConfig = {
        ...serial_config,
        open_status: !serial_config.open_status,
      };
      setSerialConfig(nextConfig);
      await invoke('update_config', { newConfig: nextConfig });
    }
  }

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
  }

  const scan_serial = async () => {
    await invoke('scan_serial').then((devices) => {
      setSerialList(devices as Array<SerialDevice>);
    });
  }
  const config_change = async <K extends keyof SerialConfig>(key: K, value: SerialConfig[K]) => {
    const nextConfig = {
      ...serial_config,
      [key]: value,
    };
    setSerialConfig(nextConfig);
    await invoke('update_config', { newConfig: nextConfig });
  };

  const send_msg = async () => {
    if (!hex_send) {
      let data = new TextEncoder().encode(send_data);
      if (show_send_message && data.length > 0) {
        send_message_display('\n' + send_data);
      }
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
      if (show_send_message) {
        if (hexString.length % 2 !== 0) {
          const displayString = '\n' + hexString.slice(0, -1) + '0' + hexString.slice(-1);
          send_message_display(displayString);
        }
      }
      await invoke('send_msg', { msg: uint8Array });
    }
  }

  const send_message_display = (msg: string) => {
    if (serial_config.open_status) {
      setReceiveText((prev) => [...prev, { content: '< ' + msg, color: color, type: 'send' }]);
      setNeedScroll(true);
    }
  }

  return (
    <div className="main-container">
      <Splitter className="splitter">
        <Splitter.Panel className="left-splitter" min={200} defaultSize={200}>
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
                onActive={scan_serial}
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
              <Checkbox checked={hex_show} onChange={(e) => { setHexShow(e.target.checked); hex_show_ref.current = e.target.checked }}>
                十六进制显示
              </Checkbox>
            </div>
            <div className="checkbox_withinput-row">
              <Checkbox checked={auto_frame} onChange={(e) => setAutoFrame(e.target.checked)}>
                自动断帧(ms)
              </Checkbox>
              <InputNumber<number>
                min={1}
                size="small"
                defaultValue={10}
                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                changeOnWheel
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
              <Checkbox>定时发送(s)</Checkbox>
              <InputNumber<number>
                min={1}
                size="small"
                defaultValue={1000}
                formatter={formatter}
                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number * 10}
                changeOnWheel
              />
            </div>
            <div className="checkbox-row">
              <Checkbox checked={show_send_message} onChange={(e) => { setShowSendMessage(e.target.checked); show_send_message_ref.current = e.target.checked }}>
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
            <div className="checkbox-row">
              <Checkbox>自动重连</Checkbox>
            </div>
            <div style={{ height: "30px" }}></div>
          </div>
          <div className="bottom-bar">
            <div className='inner-icon'>
              <ShrinkOutlined className='icon shrink-icon' />
            </div>
            <div className='inner-icon'>
              <ToTopOutlined className='icon to-top-icon' />
            </div>
            <div className='inner-icon' onClick={clean_output}>
              <ClearOutlined className='icon clear-icon' />
            </div>
            <div className='inner-icon'>
              <SettingOutlined className='icon setting-icon' />
            </div>
          </div>
        </Splitter.Panel>

        <Splitter.Panel>
          <div className="right-splitter">
            {messageHolder}
            <div className="show-section" id="show-section">
              {receive_text.map((logLine, index) => {
                return (
                  <div
                    key={index}
                    style={{
                      color: logLine.color,
                      wordBreak: 'break-all',
                    }}
                  >
                    {logLine.content}
                  </div>
                );
              })}
            </div>
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
              发送0条，接收0条
            </div>
          </div>
        </Splitter.Panel>
      </Splitter>
    </div >
  );
};

export default SerialDebugger;