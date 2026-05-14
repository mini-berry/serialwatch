import "./EditorPage.css";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { javascript } from "@codemirror/lang-javascript"; // 建议引入语言包以启用高亮
import React from "react";
import { UpOutlined, DownOutlined, DeleteOutlined, EditOutlined, PlusSquareOutlined, SaveOutlined, ScissorOutlined, SnippetsOutlined, CopyOutlined, FormatPainterOutlined } from "@ant-design/icons";
import { Layout, ConfigProvider, theme, Menu, Dropdown, Button } from "antd";
import { useSyncExternalStore } from 'react';
import type { MenuProps } from 'antd';
import { useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ScriptConfig {
    recv_script: [string, string][];
    send_script: [string, string][];
}

const EditorPage: React.FC = () => {
    const [scriptConfig, setScriptConfig] = React.useState<ScriptConfig>({
        recv_script: [],
        send_script: []
    });
    useEffect(() => {
        invoke('load_script_config').then((scripts) => {
            let scriptsConfig = scripts as ScriptConfig || { recv_script: [], send_script: [] };
            setScriptConfig(scriptsConfig);
        });
    }, []);
    const contextItems: MenuProps['items'] = [
        { key: '1', label: '编辑', icon: <EditOutlined /> },
        { key: '2', label: '删除', icon: <DeleteOutlined /> },
    ]
    const items: MenuProps['items'] = useMemo(() => [
        {
            key: 'recv',
            label: '接收脚本',
            icon: <DownOutlined />,
            children: scriptConfig.recv_script.map((script, index) => ({
                key: `recv-${index}`,
                label: (
                    <Dropdown menu={{ items: contextItems }} trigger={['contextMenu']}>
                        <div onContextMenu={(e) => { console.log(index); e.preventDefault(); e.stopPropagation() }}>{script[0]}</div>
                    </Dropdown>
                )
            })),
        },
        {
            key: 'send',
            label: '发送脚本',
            icon: <UpOutlined />,
            // 修正了 send_script 的展开方式
            children: scriptConfig.send_script.map((script, index) => ({
                key: `send-${index}`,
                label: (
                    <Dropdown menu={{ items: contextItems }} trigger={['contextMenu']}>
                        <div onContextMenu={(e) => { console.log(index); e.preventDefault(); e.stopPropagation() }}>{script[0]}</div>
                    </Dropdown>
                )
            })),
        }
    ], [scriptConfig]);
    const [code, setCode] = React.useState<string>("console.log('Hello World');\n");
    // 监视local配置
    const subscribe = (onStoreChange: () => void) => {
        window.addEventListener('storage', onStoreChange);
        return () => {
            window.removeEventListener('storage', onStoreChange);
        };
    };

    // local配置回调函数
    const getSnapshot = () => {
        const configString = localStorage.getItem('darkMode');
        return configString === 'true';
    };

    // local配置监控启用
    const darkMode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    return (
        <ConfigProvider
            theme={{
                algorithm: darkMode ? theme.darkAlgorithm : undefined
            }}>
            <div className="main-container">
                <Layout className="main-layout">
                    <Layout.Header className="header">
                        <Button type="primary" className="new-button">
                            <PlusSquareOutlined /> 新建脚本
                        </Button>
                        <Button className="all-button">
                            <SaveOutlined />
                        </Button>
                        <Button className="all-button">
                            <CopyOutlined />
                        </Button>
                        <Button className="all-button">
                            <ScissorOutlined />
                        </Button>
                        <Button className="all-button">
                            <SnippetsOutlined />
                        </Button>
                        <Button className="all-button">
                            <FormatPainterOutlined />
                        </Button>
                    </Layout.Header>
                    <Layout>
                        <Layout.Sider width="180">
                            <Menu
                                className="sider-menu"
                                defaultSelectedKeys={['1']}
                                defaultOpenKeys={['recv', 'send']}
                                mode="inline"
                                items={items}
                                onContextMenu={(e) => { console.log(e.target); e.preventDefault(); e.stopPropagation() }}
                            />
                        </Layout.Sider>
                        <Layout.Content className="content">
                            <CodeMirror
                                value={code}
                                height="100%" // 告诉组件占满父容器高度
                                width="100%"
                                extensions={[javascript()]}
                                onChange={setCode}
                                theme={darkMode ? vscodeDark : vscodeLight}
                                className="coder-mirror-container"
                            />
                        </Layout.Content>
                    </Layout>
                </Layout>
            </div>
        </ConfigProvider>
    );
}

export default EditorPage;