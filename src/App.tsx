import React from 'react';
import { Button } from 'antd';
import { Select } from 'antd';
import { Splitter } from 'antd';
import { Checkbox } from 'antd';
import { Divider } from 'antd';
import './App.css';

// 自定义组件类型定义
interface SerialDebuggerProps {
  // 可以添加props定义
}

const SerialDebugger: React.FC<SerialDebuggerProps> = () => {
  return (
    <div style={{ height: '100vh', backgroundColor: '#f8f9fa' }}>
      <Splitter style={{ height: '100vh', overflow: 'hidden' }}>
        <Splitter.Panel>
          {/* 串口设置 */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ width: '60px', fontWeight: 'bold' }}>端口名</label>
            <Select style={{ flex: 1, marginRight: '10px' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ width: '60px', fontWeight: 'bold' }}>波特率</label>
            <Select style={{ flex: 1, marginRight: '10px' }} options={[
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
            ]} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ width: '60px', fontWeight: 'bold' }}>数据位</label>
            <Select style={{ flex: 1, marginRight: '10px' }} options={[
              { value: '5', label: '5' },
              { value: '6', label: '6' },
              { value: '7', label: '7' },
              { value: '8', label: '8' },
            ]} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ width: '60px', fontWeight: 'bold' }}>校验位</label>
            <Select style={{ flex: 1, marginRight: '10px' }} options={[
              { value: 'none', label: 'None' },
              { value: 'even', label: 'Even' },
              { value: 'mark', label: 'Mark' },
              { value: 'odd', label: 'Odd' },
            ]} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ width: '60px', fontWeight: 'bold' }}>停止位</label>
            <Select style={{ flex: 1, marginRight: '10px' }} options={[
              { value: '1', label: '1' },
              { value: '1.5', label: '1.5' },
              { value: '2', label: '2' },
            ]} />
          </div>

          <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', flexWrap: 'wrap' }}>
            <Button style={{ backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', width: '40px' }} size="small">RI</Button>
            <Button style={{ backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', width: '40px' }} size="small">DSR</Button>
            <Button style={{ backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', marginRight: '10px' }} size="small">CTS</Button>
            <Button style={{ backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', width: '40px' }} size="small">DTR</Button>
            <Button style={{ backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', width: '40px' }} size="small">RTS</Button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', marginRight: '10px' }}>
            <Button style={{ width: '100%', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px' }}>打开</Button>
          </div>
          <Divider size="small" />
          {/* 接收设置 */}
          <div>
            <h3 style={{ margin: '-5px 0 3px 0' }}>接收设置</h3>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <Checkbox>十六进制显示</Checkbox>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <Checkbox>自动断帧</Checkbox>
          </div>
          <Divider size="small" />
          {/* 发送设置 */}
          <div>
            <h3 style={{ margin: '-5px 0 3px 0' }}>发送设置</h3>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <Checkbox>十六进制发送</Checkbox>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <Checkbox>定时发送</Checkbox>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <Checkbox>显示发送字符串</Checkbox>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <Checkbox>自动重连</Checkbox>
          </div>
        </Splitter.Panel>
        <Splitter.Panel style={{ padding: '20px', backgroundColor: '#ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', position: 'relative' }}>
          <div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#007bff', border: 'none', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12H19L13 6M13 18L19 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div style={{ marginTop: '5px', color: '#007bff', cursor: 'pointer' }}>▼</div>
          </div>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};

export default SerialDebugger;