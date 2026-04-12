import React, { useState, useEffect } from 'react';
import './App.css';
import { InputNumber, ColorPicker, Input, Button, Select, Splitter, Checkbox, Divider, Radio } from 'antd';
import { ShrinkOutlined, ToTopOutlined, ClearOutlined, SettingOutlined } from '@ant-design/icons';
import type { InputNumberProps } from 'antd';
import { invoke } from '@tauri-apps/api/core';

// 自定义组件类型定义
interface SerialDebuggerProps {
  // 可以添加props定义
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
// const send_data = async () => {
//   // 发送数据的逻辑
// };

const SerialDebugger: React.FC<SerialDebuggerProps> = () => {
  useEffect(() => {
    invoke('scan_serial').then((devices) => {
      let deviceList = devices as Array<SerialDevice>;
      setSerialList(deviceList);

      if (deviceList.length > 0) {
        let nextConfig: SerialConfig = {
          ...serial_config,
          ['port']: deviceList[0].port,
        };
        setSerialConfig(nextConfig);
        invoke('update_config', { newConfig: nextConfig });
      }
    })
  }, []);
  const [receive_data, setReceiveData] = useState<Uint8Array>(new Uint8Array());
  const [serial_list, setSerialList] = useState<Array<SerialDevice>>([]);
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

  const { TextArea } = Input;
  const formatter: InputNumberProps<number>['formatter'] = (value) => {
    if (value === undefined || value === null) return '0.0';
    const formattedValue = (value / 10).toFixed(1);
    return `${formattedValue}`;
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

  const config_change_flow = async (index: number) => {
    const key = index === 0 ? 'dtr_enable' : 'rts_enable';
    const nextConfig = {
      ...serial_config,
      [key]: !serial_config[key],
    };
    setSerialConfig(nextConfig);
    await invoke('update_config', { newConfig: nextConfig });
  };

  return (
    <div className="main-container">
      <Splitter className="splitter">
        <Splitter.Panel className="left-splitter" >
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

            <div className="button-row">
              <Radio.Group style={{ marginLeft: '10px' }} size="small" buttonStyle="solid">
                <Radio.Button value="RI">RI</Radio.Button>
                <Radio.Button value="RI">DSR</Radio.Button>
                <Radio.Button value="RI">CTS</Radio.Button>
              </Radio.Group>

              <Button className="little-button" type={serial_config.dtr_enable ? 'primary' : 'default'} size="small" onClick={() => config_change_flow(0)}>
                <p>DTR</p>
              </Button>
              <Button className="little-button" type={serial_config.rts_enable ? 'primary' : 'default'} style={{ marginRight: '10px' }} size="small" onClick={() => config_change_flow(1)}>
                <p>RTS</p>
              </Button>
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
              <Checkbox>十六进制显示</Checkbox>
            </div>
            <div className="checkbox_withinput-row">
              <Checkbox>自动断帧(ms)</Checkbox>
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
              <Checkbox>十六进制发送</Checkbox>
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
              <Checkbox>显示发送字符串</Checkbox>
              <ColorPicker
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
            <div className='inner-icon'>
              <ClearOutlined className='icon clear-icon' />
            </div>
            <div className='inner-icon'>
              <SettingOutlined className='icon setting-icon' />
            </div>
          </div>
        </Splitter.Panel>

        <Splitter.Panel>
          <div className="right-splitter">
            <div className="show-section">
              12312312313333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
              12312312313333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
              12312312313333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
              12312312313333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
              12312312313333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
              12312312313333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
            </div>
            <div className="send-section">
              <div className="text-section">
                <TextArea
                  autoSize={{ minRows: 5, maxRows: 5 }}
                  className="text-area"
                  placeholder="请输入文本..."
                />
                <div className="send-button-container">
                  <Button className="send-button"
                  // onClick={send_data}
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
    </div>
  );
};

export default SerialDebugger;