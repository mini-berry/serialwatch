import React from 'react';
import './App.css';
import { Button, Select, Splitter, Checkbox, Divider } from 'antd';

// 自定义组件类型定义
interface SerialDebuggerProps {
  // 可以添加props定义
}

const SerialDebugger: React.FC<SerialDebuggerProps> = () => {
  return (
    <div className="serial-debugger">
      <Splitter className="serial-debugger__splitter">
        <Splitter.Panel className="left-panel">
          {/* 串口设置 */}
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
            <Checkbox style={{ marginLeft: '10px' }} />
            <Button className="serial-debugger__toggle-button" size="small">
              <p className="serial-debugger__button-text">RI</p>
            </Button>
            <Button className="serial-debugger__toggle-button" size="small">
              <p className="serial-debugger__button-text">DSR</p>
            </Button>
            <Button className="serial-debugger__toggle-button" style={{ marginRight: '5px' }} size="small">
              <p className="serial-debugger__button-text">CTS</p>
            </Button>
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

          {/* 接收设置 */}
          <div>
            <h3 className="serial-debugger__section-title">接收设置</h3>
          </div>
          <div className="serial-debugger__checkbox-row">
            <Checkbox>十六进制显示</Checkbox>
          </div>
          <div className="serial-debugger__checkbox-row">
            <Checkbox>自动断帧</Checkbox>
          </div>

          <Divider size="small" />

          {/* 发送设置 */}
          <div>
            <h3 className="serial-debugger__section-title">发送设置</h3>
          </div>
          <div className="serial-debugger__checkbox-row">
            <Checkbox>十六进制发送</Checkbox>
          </div>
          <div className="serial-debugger__checkbox-row">
            <Checkbox>定时发送</Checkbox>
          </div>
          <div className="serial-debugger__checkbox-row">
            <Checkbox>显示发送字符串</Checkbox>
          </div>
          <div className="serial-debugger__checkbox-row">
            <Checkbox>自动重连</Checkbox>
          </div>
        </Splitter.Panel>

        <Splitter.Panel className="right-panel">
          <div className="send-area">
            <button className="send-button">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 12H19L13 6M13 18L19 12"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="send-dropdown">▼</div>
          </div>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};

export default SerialDebugger;