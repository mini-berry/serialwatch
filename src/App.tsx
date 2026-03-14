import React from 'react';
import { Button } from 'antd';
import { Select } from 'antd';
import { Splitter } from 'antd';
import { Checkbox } from 'antd';
import './App.css';

// 自定义组件类型定义
interface SerialDebuggerProps {
  // 可以添加props定义
}

const SerialDebugger: React.FC<SerialDebuggerProps> = () => {
  return (
    <div>
      <Splitter>
        <Splitter.Panel>
          {/* 串口设置 */}
          <div>
            <label>端口名：</label>
            <Select />
          </div>

          <div>
            <label>波特率：</label>
            <div>
              <Select options={[
                { value: '300', label: '300' },
                { value: '600', label: '600' },
                { value: '1200', label: '1200' },
                { value: '2400', label: '2400' },
                { value: '4800', label: '4800' },
                { value: '9600', label: '9600' },
                { value: '19200', label: '19200' },
                { value: '38400', label: '38400' },
                { value: '57600', label: '57600' },
                { value: '115200', label: '115200' },
                { value: '128000', label: '128000' },
                { value: '230400', label: '230400' },
                { value: '256000', label: '256000' },
                { value: '460800', label: '460800' },
                { value: '921600', label: '921600' },
                { value: '1000000', label: '1000000' },
                { value: '1500000', label: '1500000' },
                { value: '2000000', label: '2000000' },
              ]} />
            </div>
          </div>

          <div>
            <label>数据位：</label>
            <Select options={[
              { value: '5', label: '5' },
              { value: '6', label: '6' },
              { value: '7', label: '7' },
              { value: '8', label: '8' },
            ]} />
          </div>

          <div>
            <label>校验位：</label>
            <Select options={[
              { value: 'none', label: 'None' },
              { value: 'even', label: 'Even' },
              { value: 'mark', label: 'Mark' },
              { value: 'odd', label: 'Odd' },
            ]} />
          </div>

          <div>
            <label>停止位：</label>
            <Select options={[
              { value: '1', label: '1' },
              { value: '1.5', label: '1.5' },
              { value: '2', label: '2' },
            ]} />
          </div>

          <div>
            <Button>RI</Button>
            <Button>DSR</Button>
            <Button>CTS</Button>
            <Button>DTR</Button>
            <Button>RTS</Button>
          </div>

          <Button>打开</Button>

          {/* 接收设置 */}
          <div>
            <h3>接收设置：</h3>
            <div>
              <Checkbox>十六进制显示</Checkbox>
            </div>
            <div>
              <Checkbox>自动断帧</Checkbox>
            </div>
          </div>

          {/* 发送设置 */}
          <div>
            <h3>发送设置：</h3>
            <div>
              <Checkbox>十六进制发送</Checkbox>
            </div>
            <div>
              <Checkbox>定时发送</Checkbox>
            </div>
            <div>
              <Checkbox>显示发送字符串</Checkbox>
            </div>
            <div>
              <Checkbox>自动重连</Checkbox>
            </div>
          </div>
        </Splitter.Panel>
        <Splitter.Panel>
          <div>
            <button>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12H19L13 6M13 18L19 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div>▼</div>
          </div>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};

export default SerialDebugger;