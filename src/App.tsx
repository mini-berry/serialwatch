import React from 'react';
import './App.css';
import { Button, Select, Splitter, Checkbox, Divider, Radio } from 'antd';
import { InputNumber } from 'antd';
import { ColorPicker } from 'antd';
import { Input } from 'antd';
import type { InputNumberProps } from 'antd';
// 自定义组件类型定义
interface SerialDebuggerProps {
  // 可以添加props定义
}
const { TextArea } = Input;
const formatter: InputNumberProps<number>['formatter'] = (value) => {
  if (value === undefined || value === null) return '0.0';
  const formattedValue = (value / 10).toFixed(1);
  return `${formattedValue}`;
};

const SerialDebugger: React.FC<SerialDebuggerProps> = () => {
  return (
    <div className="serial-debugger">
      <Splitter className="serial-debugger__splitter">
        <Splitter.Panel className="left-panel" >

          <div className="serial-debugger__row" style={{ paddingTop: "10px" }}>
            <label className="serial-debugger__bold-label">端口名</label>
            <Select className="serial-debugger__select" />
          </div>

          <div className="serial-debugger__row">
            <label className="serial-debugger__bold-label">波特率</label>
            <Select
              className="serial-debugger__select"
              options={[
                { value: '300', label: '300' },
                { value: '600', label: '600' },
                { value: '1200', label: '1,200' },
                { value: '2400', label: '2,400' },
                { value: '4800', label: '4,800' },
                { value: '9600', label: '9,600' },
                { value: '19200', label: '19,200' },
                { value: '38400', label: '38,400' },
                { value: '57600', label: '57,600' },
                { value: '115200', label: '115,200' },
                { value: '128000', label: '128,000' },
                { value: '230400', label: '230,400' },
                { value: '256000', label: '256,000' },
                { value: '460800', label: '460,800' },
                { value: '921600', label: '921,600' },
                { value: '1000000', label: '1,000,000' },
                { value: '1500000', label: '1,500,000' },
                { value: '2000000', label: '2,000,000' },
              ]}
            />
          </div>

          <div className="serial-debugger__row">
            <label className="serial-debugger__bold-label">数据位</label>
            <Select
              className="serial-debugger__select"
              options={[
                { value: '5', label: '5' },
                { value: '6', label: '6' },
                { value: '7', label: '7' },
                { value: '8', label: '8' },
              ]}
            />
          </div>

          <div className="serial-debugger__row">
            <label className="serial-debugger__bold-label">校验位</label>
            <Select
              className="serial-debugger__select"
              options={[
                { value: 'none', label: 'None' },
                { value: 'even', label: 'Even' },
                { value: 'mark', label: 'Mark' },
                { value: 'odd', label: 'Odd' },
              ]}
            />
          </div>

          <div className="serial-debugger__row">
            <label className="serial-debugger__bold-label">停止位</label>
            <Select
              className="serial-debugger__select"
              options={[
                { value: '1', label: '1' },
                { value: '1.5', label: '1.5' },
                { value: '2', label: '2' },
              ]}
            />
          </div>

          <div className="serial-debugger__button-row">
            <Radio.Group style={{ marginLeft: '10px' }} size="small" buttonStyle="solid">
              <Radio.Button value="RI">RI</Radio.Button>
              <Radio.Button value="RI">DSR</Radio.Button>
              <Radio.Button value="RI">CTS</Radio.Button>
            </Radio.Group>

            <Button className="serial-debugger__toggle-button" size="small">
              <p className="serial-debugger__button-text">DTR</p>
            </Button>
            <Button className="serial-debugger__toggle-button" style={{ marginRight: '10px' }} size="small">
              <p className="serial-debugger__button-text">RTS</p>
            </Button>
          </div>

          <div className="serial-debugger__open-row">
            <Button className="serial-debugger__open-button">打开</Button>
          </div>

          <Divider size="small" />

          <div>
            <h3 className="serial-debugger__section-title">接收设置</h3>
          </div>
          <div className="serial-debugger__checkbox-row">
            <Checkbox>十六进制显示</Checkbox>
          </div>
          <div className="serial-debugger__checkbox_andinput-row">
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
          <div className="serial-debugger__checkbox-row">
            <Checkbox>十六进制发送</Checkbox>
          </div>
          <div className="serial-debugger__checkbox_andinput-row">
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
          <div className="serial-debugger__checkbox-row">
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
          <div className="serial-debugger__checkbox-row">
            <Checkbox>自动重连</Checkbox>
          </div>
        </Splitter.Panel>

        <Splitter.Panel>
          <div className="container">
            <div className="blue-indicator" />
            <div className="right-section">
              <div className="top-section">
                12312312313333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
              </div>
              <div className="bottom-section">
                <div className="send-section">
                  <TextArea autoSize={{ minRows: 5, maxRows: 5 }}
                    className="rounded-input"
                    placeholder="请输入文本..."
                  />
                  <div className="send-button-container">
                    <Button className="send-button">发送</Button>
                  </div>
                </div>
              </div>
              <div className="log-section">
                发送0条，接收0条
              </div>
            </div>
          </div>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};

export default SerialDebugger;