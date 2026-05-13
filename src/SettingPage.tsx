import { Button, Layout, Menu, Switch } from 'antd';
import { MenuProps } from 'antd';
import { ConfigProvider, theme } from 'antd';
import { InfoOutlined, LaptopOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import './SettingPage.css';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

const items: MenuProps['items'] = [{
    key: '1',
    label: `显示`,
    icon: <LaptopOutlined />,
}, {
    key: '2',
    label: `关于`,
    icon: <InfoOutlined />
}];

const SettingPage: React.FC = () => {
    useEffect(() => {
        const darkMode = localStorage.getItem('darkMode');
        if (darkMode === 'true') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }, []);
    const [currentKey, setCurrentKey] = useState('1');
    const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') === 'true');
    const handleOpen = async (url: string) => {
        await openUrl(url);
    }

    const onClose = async () => {
        invoke('close_about');
    };

    const onChangeDarkMode = (checked: boolean) => {
        setDarkMode(checked);
        if (checked) {
            localStorage.setItem('darkMode', 'true');
            document.body.classList.add('dark-mode');
        } else {
            localStorage.setItem('darkMode', 'false');
            document.body.classList.remove('dark-mode');
        }
    };

    const Display = () => {
        return (<div className="setting-row"><div>夜间模式</div> < Switch
            checkedChildren={< CheckOutlined />}
            unCheckedChildren={< CloseOutlined />}
            checked={darkMode}
            onChange={onChangeDarkMode}
        /></div>)
    };
    const About = () => {
        return (<div style={{ paddingTop: '0' }}>
            <h2>Serialwatch.rs V1.0.2</h2>
            <p>作者: Mini-Berry</p>
            <p>开源地址:</p>
            <a onClick={(e) => { e.preventDefault(); handleOpen('https://github.com/mini-berry/serialwatch'); }} href="https://github.com/mini-berry/serialwatch" target="_blank" rel="noopener noreferrer">https://github.com/mini-berry/serialwatch</a>
        </div>)
    };
    const handleMenuClick = (e: any) => {
        setCurrentKey(e.key);
    };
    return (
        <ConfigProvider
            theme={{
                algorithm: darkMode ? theme.darkAlgorithm : undefined
            }}>
            <Layout style={{ 'height': '100vh' }}>
                <Layout.Content>
                    <Layout style={{ height: '100%' }}>
                        <Layout.Sider width={100} >
                            <Menu items={items} style={{ height: '100%' }} onClick={handleMenuClick}>
                            </Menu>
                        </Layout.Sider>
                        <Layout.Content style={{ padding: '15px 15px 0px 15px' }}>
                            {currentKey === '1' && <Display />}
                            {currentKey === '2' && <About />}
                        </Layout.Content>
                    </Layout>
                </Layout.Content >
                <Layout.Footer className="footer">
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button onClick={onClose}>关闭</Button>
                    </div>
                </Layout.Footer>
            </Layout >
        </ConfigProvider>
    );
}
export default SettingPage;