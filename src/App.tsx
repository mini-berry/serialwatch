import React, { useState, useEffect, useRef } from 'react';
import { ConfigProvider, theme } from 'antd';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useSyncExternalStore } from 'react';
import './App.css';
import { InputNumber, ColorPicker, Input, Button, Select, Splitter, Checkbox, Divider, Dropdown, Radio } from 'antd';
import { ClearOutlined, SettingOutlined, UpOutlined, DownOutlined, CopyOutlined, EditOutlined, CheckOutlined, UploadOutlined } from '@ant-design/icons';
import type { InputNumberProps } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import type { MenuProps } from 'antd';
import type { MenuInfo } from '@rc-component/menu/lib/interface';
import { message } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

interface OutLine {
  raw_data?: Uint8Array;
  content: string;
  color?: string;
  type: 'send' | 'receive' | 'info';
}

interface CheckMemory {
  hex_show?: boolean;
  hex_send?: boolean;
  auto_frame?: boolean;
  show_send?: boolean;
  auto_frame_time?: number;
  send_color?: string;
  auto_send_time?: number;
  timer_interval?: number;
}

interface SerialConfig {
  port: string;
  baud: number;
  data_bits: number;
  parity: 'None' | 'Odd' | 'Even';
  stop_bits: number;
  flow_control: 'None' | 'RtsCts' | 'XonXoff';
  open_status: boolean;
  dtr: boolean;
  rts: boolean;
}
interface SerialDevice {
  name: string;
  port: string;
}
interface ScriptConfig {
  recv_script: [string, string][];
  send_script: [string, string][];
}
const SerialDebugger: React.FC = () => {
  // 监视local配置
  const subscribe = (onStoreChange: () => void) => {
    window.addEventListener('storage', onStoreChange);
    return () => {
      window.removeEventListener('storage', onStoreChange);
    };
  };

  // local配置回调函数
  const getSnapshot = () => {
    return localStorage.getItem('darkMode') === 'true';
  };

  const [customBaud, setCustomBaud] = useState<number | null>(null);
  const [checkMemory, setCheckMemory] = useState<CheckMemory>(
    {
      hex_show: false,
      hex_send: false,
      auto_frame: true,
      show_send: false,
      auto_frame_time: 100,
      send_color: '#31a9ff',
      auto_send_time: 1000,
      timer_interval: 3000,
    }
  )

  const checkMemoryRef = useRef(checkMemory);
  useEffect(() => {
    checkMemoryRef.current = checkMemory;
  }, [checkMemory]);

  const saveMemoryToLocal = (memory: CheckMemory) => {
    localStorage.setItem('checkMemory', JSON.stringify(memory));
  }

  // local配置监控启用
  const darkMode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [hasUpdate, setHasUpdate] = useState(false);
  // 发送接收计数
  const [receive_count, setReceiveCount] = useState<number>(0);
  const [send_count, setSendCount] = useState<number>(0);
  // 接收文本
  const [receive_text, setReceiveText] = useState<OutLine[]>([]);
  // 是否需要自动滚动到底部
  const need_scroll_ref = useRef(false);
  // 自动断帧时间记录
  const last_receive_time_ref = useRef<number>(0);
  // 输入文本框
  const [sendText_data, setSendTextData] = useState<string>('');
  const sendText_data_ref = useRef(sendText_data);
  useEffect(() => {
    sendText_data_ref.current = sendText_data;
  }, [sendText_data]);
  const sendMsgRef = useRef<() => Promise<void>>(async () => { });
  const sendingRef = useRef(false);
  const inputRef = useRef<TextAreaRef>(null);
  // 串口列表
  const [serial_list, setSerialList] = useState<Array<SerialDevice>>([]);

  // 定时发送
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 串口配置
  const [serial_config, setSerialConfig] = useState<SerialConfig>({
    port: '',
    baud: 9600,
    data_bits: 8,
    parity: 'None',
    stop_bits: 1,
    flow_control: 'None',
    open_status: false,
    dtr: false,
    rts: false,
  });
  const serial_config_ref = useRef(serial_config);
  useEffect(() => {
    serial_config_ref.current = serial_config;
  }, [serial_config]);

  //脚本配置
  const recv_script_enable_ref = useRef(false);
  const send_script_enable_ref = useRef(false);
  const recv_script_ref = useRef<string>('');
  const send_script_ref = useRef<string>('');
  const [script_config, setScriptConfig] = useState<ScriptConfig>({ recv_script: [], send_script: [] });

  const openSettings = async () => {
    await invoke('open_and_activate_about');
  }
  const openEditor = async () => {
    await invoke('open_and_activate_editor');
  }

  const appendLogLine = (log: string, color?: string) => {
    setReceiveText((prev) => [...prev, { content: log, type: 'info', color: color }]);
  }

  function print_logline(log: string, color?: string) {
    appendLogLine(log, color);
    const showSection = document.getElementById('show-section');
    const nowOnBottom = showSection ? (showSection.scrollTop + showSection.clientHeight + 25 >= showSection.scrollHeight) : false;
    need_scroll_ref.current = nowOnBottom;
  }

  function send_data(data: Uint8Array) {
    if (!serial_config_ref.current.open_status || data.length === 0) {
      return;
    }
    setSendCount((prev) => prev + data.length);
    invoke('send_msg', { msg: data });
  }

  // 定时器修改时处理定时发送逻辑
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(async () => {
        await sendMsgRef.current();
      }, checkMemoryRef.current.timer_interval || 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timerRunning, checkMemory.timer_interval]);

  // 收到数据时处理滚动逻辑
  useEffect(() => {
    if (need_scroll_ref.current) {
      const showSection = document.getElementById('show-section');
      if (showSection) {
        const targetTop = showSection.scrollHeight - showSection.clientHeight;
        showSection.scrollTo({
          top: targetTop,
          behavior: 'instant'
        });
      }
      need_scroll_ref.current = false;
    }
  }, [receive_text]);

  const [messageApi, messageHolder] = message.useMessage();
  // 初始化
  useEffect(() => {
    const isMountedRef = { current: true };

    invoke('process_update').then((update) => {
      // setHasUpdate(update as boolean);
      setHasUpdate(true);
    });

    // 扫描串口并加载配置
    invoke('scan_serial').then((devices) => {
      if (!isMountedRef.current) return;
      let deviceList = devices as Array<SerialDevice>;
      setSerialList(deviceList);

      let savedConfig: SerialConfig | undefined = undefined;
      const savedConfigString = localStorage.getItem('serialConfig');
      if (savedConfigString) {
        try {
          const defaultSerialConfig: SerialConfig = {
            port: '',
            baud: 9600,
            data_bits: 8,
            parity: 'None',
            stop_bits: 1,
            flow_control: 'None',
            open_status: false,
            dtr: false,
            rts: false,
          };
          const parsed = JSON.parse(savedConfigString) as SerialConfig;
          savedConfig = { ...defaultSerialConfig, ...parsed, open_status: false };
        } catch (e) {
        }
      }

      if (savedConfig) {
        if (deviceList.some(device => device.port === savedConfig.port)) {
          setSerialConfig(savedConfig);
        }
        else {
          let newConfig = { ...savedConfig, port: deviceList.length > 0 ? deviceList[0].port : '' };
          setSerialConfig(newConfig);
        }
      }

      let savedCheck: CheckMemory | undefined = undefined;
      const savedCheckString = localStorage.getItem('checkMemory');
      if (savedCheckString) {
        try {
          const defaultCheck: CheckMemory = {
            hex_show: false,
            hex_send: false,
            auto_frame: false,
            show_send: false,
            auto_frame_time: 100,
            auto_send_time: 1000,
            send_color: '#31a9ff',
            timer_interval: 3000,
          };
          const parsed = JSON.parse(savedCheckString) as CheckMemory;
          savedCheck = { ...defaultCheck, ...parsed };
          setCheckMemory(savedCheck);
        } catch (e) {
        }
      }
    });

    // 加载脚本配置
    invoke('load_script_config').then((scripts) => {
      if (!isMountedRef.current) return;
      let scriptsConfig = scripts as ScriptConfig || { recv_script: [], send_script: [] };
      setScriptConfig(scriptsConfig);
    });

    let unlistenDataUpdated: (() => void) | undefined;
    let unlistenSerialFailed: (() => void) | undefined;
    let unlistenSerialError: (() => void) | undefined;
    let isMounted = [true, true, true];
    const setupListeners = async () => {
      unlistenDataUpdated = await listen('data-updated', (event) => {
        if (!isMounted[0]) return;
        const data = event.payload as Array<number>;
        const frame_break = checkMemoryRef.current.auto_frame && Date.now() - last_receive_time_ref.current > (checkMemoryRef.current.auto_frame_time || 1000);
        const uint8Data = new Uint8Array(data);
        const showSection = document.getElementById('show-section');
        const nowOnBottom = showSection ? (showSection.scrollTop + showSection.clientHeight + 25 >= showSection.scrollHeight) : false;
        need_scroll_ref.current = nowOnBottom;
        setReceiveCount((prev) => prev + uint8Data.length);
        // 数据过多时自动清理
        setReceiveText((prev) => {
          if (prev.length > 1000) {
            return prev.slice(prev.length - 1000);
          }
          if (prev.length > 0 && prev[prev.length - 1].content.length > 10000) {
            const safeContent = prev[prev.length - 1].content.slice(-5000);
            const newRawData = new TextEncoder().encode(safeContent);
            return [
              {
                type: prev[prev.length - 1].type,
                color: prev[prev.length - 1].color,
                raw_data: newRawData,
                content: safeContent
              }
            ];
          }
          return prev;
        });
        if (recv_script_enable_ref.current && recv_script_ref.current) {
          const get_data = () => new Uint8Array(uint8Data);

          const scriptString = 'try{' + recv_script_ref.current + '}catch(e){console.error("脚本执行错误", e)}';
          new Function('print_logline', 'get_data', 'console', 'send_data', scriptString)(print_logline, get_data, console, send_data);
          return;
        }
        // 关闭十六进制显示
        if (!checkMemoryRef.current.hex_show) {
          setReceiveText((prev) => {
            // 上一行是接收数据，且未开启自动断帧或未超时，则合并到上一行
            if (!(checkMemoryRef.current.auto_frame && frame_break) && prev.length > 0 && prev[prev.length - 1].type === 'receive') {
              return appendReceiveLine(prev, uint8Data, { mergePrevious: true });
            }

            return appendReceiveLine(prev, uint8Data, {
              prefixSendTag: checkMemoryRef.current.show_send,
            });
          });
        }
        // 开启十六进制显示
        else {
          const hexString = Array.from(uint8Data)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(' ').toUpperCase();
          setReceiveText((prev) => {
            if (!(checkMemoryRef.current.auto_frame && frame_break) && prev.length > 0 && prev[prev.length - 1].type === 'receive') {
              return appendHexReceiveLine(prev, hexString, uint8Data, {
                mergePrevious: true,
              });
            }
            return appendHexReceiveLine(prev, hexString, uint8Data, { prefixSendTag: checkMemoryRef.current.show_send });
          });
        };
        if (checkMemoryRef.current.auto_frame) {
          last_receive_time_ref.current = Date.now();
        }
      });
      unlistenSerialFailed = await listen('serial-failed', (event) => {
        if (!isMounted[1]) return;
        const errorMessage = event.payload as string;
        setSerialConfig((prevConfig) => ({
          ...prevConfig,
          open_status: false, // 连接失败时将状态设置为未打开
        }));
        messageApi.error(`串口错误: ${errorMessage}`);
      });
      unlistenSerialError = await listen('tips', (event) => {
        if (!isMounted[2]) return;
        const errorMessage = event.payload as string;
        messageApi.info(`串口错误: ${errorMessage}`);
      });
    };

    setupListeners();
    return () => {
      isMountedRef.current = false;
      isMounted = [false, false, false];
      if (unlistenDataUpdated) {
        unlistenDataUpdated();
      }
      if (unlistenSerialFailed) {
        unlistenSerialFailed();
      }
      if (unlistenSerialError) {
        unlistenSerialError();
      }
    };
  }, []);

  const formatter: InputNumberProps<number>['formatter'] = (value) => {
    const num = value ?? 0;
    return parseFloat((num / 10).toFixed(1)).toString();
  };

  const appendReceiveLine = (
    prev: OutLine[],
    data: Uint8Array,
    options?: {
      mergePrevious?: boolean;
      prefixSendTag?: boolean;
    }
  ): OutLine[] => {
    const { mergePrevious = false, prefixSendTag = false } = options ?? {};

    if (mergePrevious) {
      const prevLast = prev[prev.length - 1];
      // 提前计算合并后的 raw_data，避免重复写代码
      const mergedRawData = prevLast.raw_data
        ? new Uint8Array([...prevLast.raw_data, ...data])
        : data;

      return [
        ...prev.slice(0, -1),
        {
          ...prevLast,
          raw_data: mergedRawData,
          // 加上括号修复优先级问题
          content: (prefixSendTag ? '> ' : '') + new TextDecoder().decode(mergedRawData)
        }
      ];
    } else {
      return [
        ...prev,
        {
          raw_data: data,
          // 这里同样加上括号，并且补充了 type 字段
          content: (prefixSendTag ? '> ' : '') + new TextDecoder().decode(data),
          type: 'receive'
        }
      ];
    }
  };

  const appendHexReceiveLine = (
    prev: OutLine[],
    hexString: string,
    raw_data: Uint8Array,
    options?: {
      mergePrevious?: boolean;
      prefixSendTag?: boolean;
    }
  ): OutLine[] => {
    const { mergePrevious = false, prefixSendTag = false } = options ?? {};
    if (mergePrevious)
      return [...prev.slice(0, -1),
      {
        ...prev[prev.length - 1],
        raw_data: prev[prev.length - 1].raw_data
          ? new Uint8Array([...prev[prev.length - 1].raw_data!, ...raw_data])
          : raw_data,
        content: (prev[prev.length - 1].content || '') + ' ' + hexString
      }];
    else
      return [...prev,
      {
        raw_data: raw_data,
        content: (prefixSendTag ? '> ' : '') + hexString,
        type: 'receive'
      }];
  };

  const send_message_display = (msg: string) => {
    if (serial_config_ref.current.open_status) {
      setReceiveText((prev) => [...prev, { content: '< ' + msg, color: checkMemoryRef.current.send_color, type: 'send' }]);
      need_scroll_ref.current = true;
    }
  };

  const clean_output = () => {
    setReceiveText([]);
    setReceiveCount(0);
    setSendCount(0);
  };

  const open_serial = async () => {
    if (serial_list.some(device => device.port === serial_config_ref.current.port)) {
      const nextConfig = {
        ...serial_config_ref.current,
        open_status: !serial_config_ref.current.open_status,
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
      ...serial_config_ref.current,
      [key]: value,
    };
    localStorage.setItem('serialConfig', JSON.stringify(nextConfig));
    setSerialConfig(nextConfig);
    if (serial_config_ref.current.open_status) {
      await invoke('update_config', { newConfig: nextConfig });
    }
  };

  const input_change = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (checkMemory.hex_send) {
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

      setSendTextData(formattedValue);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.resizableTextArea?.textArea.setSelectionRange;

          const finalPos = Math.min(newCursorPos, formattedValue.length);
          inputRef.current?.resizableTextArea?.textArea.setSelectionRange(finalPos, finalPos);
        }
      }, 0);
    }
    else
      setSendTextData(e.target.value);
  };

  const hex_send_change = (e: CheckboxChangeEvent) => {
    setCheckMemory((prev) => { const newMem = { ...prev, hex_send: e.target.checked }; saveMemoryToLocal(newMem); return newMem; });
    if (!e.target.checked) {
      let hexString = sendText_data.replace(/\s+/g, '');
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
      setSendTextData(decodedString.replace(/\uFFFD/g, ' '));
    }
    else {
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(sendText_data);
      const hexString = Array.from(uint8Array)
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      setSendTextData(hexString);
    }
  };

  const send_msg = async () => {
    if (sendingRef.current) {
      return;
    }
    if (!serial_config_ref.current.open_status || sendText_data_ref.current.length === 0) {
      return;
    }
    sendingRef.current = true;
    try {
      if (!checkMemoryRef.current.hex_send) {
        let data = new TextEncoder().encode(sendText_data_ref.current);
        console.log(send_script_enable_ref.current, send_script_ref.current);
        if (send_script_enable_ref.current && send_script_ref.current) {
          const get_send_data = () => new Uint8Array(data);
          const scriptString = 'try{' + send_script_ref.current + '}catch(e){console.error("脚本执行错误", e)}';
          console.log('执行发送脚本', scriptString);
          new Function('print_logline', 'get_send_data', 'console', 'send_data', scriptString)(print_logline, get_send_data, console, send_data);
          return;
        }
        setSendCount((prev) => prev + data.length);
        if (checkMemoryRef.current.show_send && data.length > 0) {
          send_message_display(sendText_data_ref.current);
        }
        await invoke('send_msg', { msg: data });
      }
      else {
        const hexString = sendText_data_ref.current.replace(/\s+/g, '');
        const bytes = [];
        for (let i = 0; i < hexString.length; i += 2) {
          const byteVal = parseInt(hexString.slice(i, i + 2), 16);
          bytes.push(isNaN(byteVal) ? 0 : byteVal);
        }
        const uint8Array = new Uint8Array(bytes);
        if (send_script_enable_ref.current && send_script_ref.current) {
          const get_send_data = () => new Uint8Array(uint8Array);
          const scriptString = 'try{' + send_script_ref.current + '}catch(e){console.error("脚本执行错误", e)}';
          new Function('print_logline', 'get_send_data', 'console', 'send_data', scriptString)(print_logline, get_send_data, console, send_data);
          return;
        }
        if (checkMemoryRef.current.show_send && uint8Array.length > 0) {
          if (hexString.length % 2 !== 0) {
            const displayString = (sendText_data_ref.current.slice(0, -1) + '0' + sendText_data_ref.current.slice(-1));
            send_message_display(displayString);
          }
          else {
            const displayString = sendText_data_ref.current;
            send_message_display(displayString);
          }
        }
        setSendCount((prev) => prev + uint8Array.length);
        await invoke('send_msg', { msg: uint8Array });
      }
    } finally {
      sendingRef.current = false;
    }
  };

  useEffect(() => {
    sendMsgRef.current = send_msg;
  }, [send_msg]);

  const [secMenuOpen, setSecMenuOpen] = useState(false);
  const selectedTextRef = useRef<string>('');
  const [selectedBool, setSelectedBool] = useState(false);
  const copySelectedText = async () => {
    const selectedText = selectedTextRef.current;
    if (selectedText.length > 0) {
      await writeText(selectedText);
    }
  }

  const copyAllText = async () => {
    const allText = receive_text.map(line => line.content).join('\n');
    if (allText.length > 0) {
      await writeText(allText);
    }
  }

  const copyLineText = async (line: number) => {
    const lineContent = receive_text[line]?.content || '';
    if (lineContent.length > 0) {
      await writeText(lineContent);
    }
  }

  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);

  const collapseHandler = (collapsed: boolean[], _sizes: number[]) => {
    setLeftPanelCollapsed(Boolean(collapsed[0]));
  }

  const copyToSendArea = () => {
    const selectedText = selectedTextRef.current;
    if (selectedText.length > 3) {
      let textToCopy = selectedText.trim();
      const regex = /^[0-9A-F]{2}(?: [0-9A-F]{2})*$/;
      setCheckMemory((prev) => { const newMem = { ...prev, hex_send: regex.test(textToCopy) }; saveMemoryToLocal(newMem); return newMem; });
      setSendTextData(textToCopy);
    }
    else
      setSendTextData(selectedText);
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
  const preventContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
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
          <Splitter.Panel className={`left-splitter no-select ${leftPanelCollapsed ? 'collapsed' : ''} ${darkMode ? 'dark' : ''}`} min={200} defaultSize={200} collapsible={{ start: true, end: true, showCollapsibleIcon: true }}>
            <div className='left-section' onContextMenu={preventContextMenu}>
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
                  onOpenChange={(e) => { if (e) scan_serial(); }}
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
                  popupRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '3px 0 4px 0' }} />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <InputNumber placeholder="自定义"
                          variant="borderless"
                          style={{ flex: 1, height: '28px' }}
                          max={2000000}
                          min={300}
                          controls={false}
                          value={customBaud}
                          onChange={(value) => setCustomBaud(value)}
                          onPressEnter={() => { if (customBaud) config_change('baud', customBaud); }} />
                        <Button
                          type="primary"
                          icon={<CheckOutlined />}
                          style={{ height: '28px', width: '28px' }}
                          onClick={() => { if (customBaud) config_change('baud', customBaud); }}
                        />
                      </div>
                    </>
                  )}
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
                <Radio.Group size="small" buttonStyle="solid" block value={serial_config.flow_control} onChange={(e) => { config_change('flow_control', e.target.value) }}>
                  <Radio.Button value="None" >关闭</Radio.Button>
                  <Radio.Button value="RtsCts" >RtsCts</Radio.Button>
                  <Radio.Button value="XonXoff" >XonXoff</Radio.Button>
                </Radio.Group>
              </div>

              {serial_config.flow_control === 'RtsCts' && <div className="little-button-row" >
                <Button className="little-button" type={serial_config.dtr ? 'primary' : 'default'} onClick={() => config_change('dtr', !serial_config.dtr)}>
                  DTR
                </Button>
                <Button className="little-button" type={serial_config.rts ? 'primary' : 'default'} onClick={() => config_change('rts', !serial_config.rts)}>
                  RTS
                </Button>
              </div>}
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
                <Checkbox checked={checkMemory.hex_show} onChange={(e) => { setCheckMemory((prev) => { const newMem = { ...prev, hex_show: e.target.checked }; saveMemoryToLocal(newMem); return newMem; }); }}>
                  十六进制显示
                </Checkbox>
              </div>
              <div className="checkbox_withinput-row">
                <Checkbox checked={checkMemory.auto_frame} onChange={(e) => { setCheckMemory((prev) => { const newMem = { ...prev, auto_frame: e.target.checked }; saveMemoryToLocal(newMem); return newMem; }); }}>
                  自动断帧(ms)
                </Checkbox>
                <InputNumber<number>
                  min={1}
                  step={100}
                  size="small"
                  value={checkMemory.auto_frame_time}
                  parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                  changeOnWheel
                  onChange={(value) => { setCheckMemory((prev) => { const newMem = { ...prev, auto_frame_time: value || 10 }; saveMemoryToLocal(newMem); return newMem; }); }}
                />
              </div>
              <div className="checkbox_withinput-row">
                <Checkbox onChange={(e) => { recv_script_enable_ref.current = e.target.checked; }}>
                  脚本
                </Checkbox>
                <Select className='script-select' options={script_config.recv_script.map((v) => ({ label: v[0], value: v[1] }))} onOpenChange={() => invoke('load_script_config').then((scripts) => {
                  setScriptConfig(scripts as ScriptConfig);
                })} onSelect={(e) => recv_script_ref.current = e} />
                <Button className='edit-button' onClick={openEditor}>
                  <EditOutlined />
                </Button>
              </div>
              <Divider size="small" />

              <div>
                <h3 className="serial-debugger__section-title">发送设置</h3>
              </div>
              <div className="checkbox-row">
                <Checkbox checked={checkMemory.hex_send} onChange={hex_send_change}>
                  十六进制发送
                </Checkbox>
              </div>
              <div className="checkbox-row">
                <Checkbox checked={checkMemory.show_send} onChange={(e) => { setCheckMemory((prev) => { const newMem = { ...prev, show_send: e.target.checked }; saveMemoryToLocal(newMem); return newMem; }); }}>
                  显示发送字符串
                </Checkbox>
                <ColorPicker
                  value={checkMemory.send_color}
                  onChange={(color) => { setCheckMemory((prev) => { const newMem = { ...prev, send_color: color.toHexString() }; saveMemoryToLocal(newMem); return newMem; }); }}
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
              <div className="checkbox_withinput-row">
                <Checkbox checked={timerRunning} onChange={(e) => setTimerRunning(e.target.checked)}>
                  定时发送(s)
                </Checkbox>
                <InputNumber<number>
                  min={1}
                  size="small"
                  value={(checkMemory.timer_interval || 100000) / 100}
                  formatter={formatter}
                  parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number * 10}
                  onChange={(value) => { setCheckMemory((prev) => { const newMem = { ...prev, timer_interval: (value || 1) * 100 }; saveMemoryToLocal(newMem); return newMem; }); }}
                  changeOnWheel
                />
              </div>
              <div className="checkbox_withinput-row">
                <Checkbox onChange={(e) => { send_script_enable_ref.current = e.target.checked; }}>
                  脚本
                </Checkbox>
                <Select className='script-select' options={script_config.send_script.map((v) => ({ label: v[0], value: v[1] }))} onOpenChange={() => invoke('load_script_config').then((scripts) => {
                  setScriptConfig(scripts as ScriptConfig);
                })} onSelect={(value) => { send_script_ref.current = value }} />
                <Button className='edit-button' onClick={openEditor}>
                  <EditOutlined />
                </Button>
              </div>
              {/* <div className="checkbox-row">
              <Checkbox>自动重连</Checkbox>
            </div> */}
              <div style={{ height: "27px" }}></div>
            </div>
            <div className="bottom-bar" onContextMenu={preventContextMenu}>
              {hasUpdate && (
                <div className='update-icon' title="有新版本" onClick={async () => { await openUrl('https://swrweb.netlify.app/') }}>
                  <UploadOutlined className='icon setting-icon' />
                </div>
              )}
              <div className='inner-icon' onClick={clean_output}>
                <ClearOutlined className='icon clear-icon' />
              </div>
              <div className='inner-icon' onClick={openSettings}>
                <SettingOutlined className='icon setting-icon' />
              </div>
            </div>
          </Splitter.Panel>

          <Splitter.Panel style={{ "minWidth": "110px" }}>
            <div className={`right-splitter ${darkMode ? 'dark' : ''}`} >
              {messageHolder}
              <Dropdown menu={{ items: secMenu }} trigger={['contextMenu']} open={secMenuOpen} onOpenChange={(open) => setSecMenuOpen(open)}>
                <div className="show-section" id="show-section">
                  {receive_text.map((logLine, index) => {
                    return (
                      <Dropdown key={index} menu={{ items: logMenu, onClick: (e) => handleMenuClick(e, index) }} trigger={['contextMenu']}>
                        <div
                          className={`output-div ${darkMode ? 'dark' : ''}`}
                          key={index}
                          style={{
                            color: logLine.color,
                            wordBreak: 'break-all'
                          }}
                          onContextMenu={(e) => {
                            e.stopPropagation(); setSecMenuOpen(false);
                            let selection = window.getSelection()?.toString() || '';
                            selectedTextRef.current = selection;
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
              <div className="send-section" onContextMenu={preventContextMenu}>
                <div className="text-section" >
                  <Input.TextArea onContextMenu={(e) => e.stopPropagation()}
                    ref={inputRef}
                    autoSize={{ minRows: 5, maxRows: 5 }}
                    value={sendText_data}
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
              <div className="log-section no-select" onContextMenu={preventContextMenu}>
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
    </ConfigProvider >
  );
};

export default SerialDebugger;