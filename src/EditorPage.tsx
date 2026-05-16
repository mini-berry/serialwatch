import "./EditorPage.css";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { javascript } from "@codemirror/lang-javascript";
import React from "react";
import { UpOutlined, DownOutlined, DeleteOutlined, EditOutlined, PlusSquareOutlined, SaveOutlined, ScissorOutlined, SnippetsOutlined, CopyOutlined, FormatPainterOutlined } from "@ant-design/icons";
import { Layout, ConfigProvider, theme, Menu, Dropdown, Button, Modal } from "antd";
import { useSyncExternalStore } from 'react';
import type { MenuProps } from 'antd';
import { useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import parserEstree from 'prettier/plugins/estree';

interface ScriptConfig {
    recv_script: [string, string][];
    send_script: [string, string][];
}

const EditorPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const pendingActionRef = useRef<null | { onSave: () => void; onDiscard: () => void }>(null);
    const [menuKeys, setMenuKeys] = React.useState<string[]>([]);
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
    const [code, setCode] = React.useState<string>("console.log('Hello World');\n");
    const codeRef = useRef(code);
    useEffect(() => {
        codeRef.current = code;
    }, [code]);
    const [isCodeModified, setIsCodeModified] = React.useState<boolean>(false);
    const [openedScriptIndex, setOpenedScriptIndex] = React.useState<{ type: 'recv' | 'send'; index: number } | null>(null);
    const formatCode = async () => {
        try {
            const formattedCode = await prettier.format(code, {
                parser: "babel",
                plugins: [parserBabel, parserEstree],
                semi: true,
                singleQuote: true,
                tabWidth: 2,
                endOfLine: "auto",
            });
            if (formattedCode !== code) {
                setIsCodeModified(true);
            }
            setCode(formattedCode);
        } catch (_error) {
            console.error('代码格式化失败:', _error);
        }
    }

    const contextItems: MenuProps['items'] = useMemo(() => [
        { key: '1', label: '编辑', icon: <EditOutlined /> },
        { key: '2', label: '删除', icon: <DeleteOutlined /> },
    ], []);
    const cmItems: MenuProps['items'] = useMemo(() => [
        { key: '1', label: '复制', icon: <CopyOutlined /> },
        { key: '2', label: '剪切', icon: <ScissorOutlined /> },
        { key: '3', label: '粘贴', icon: <DeleteOutlined /> },
        { key: '4', label: '格式化', icon: <FormatPainterOutlined />, onClick: formatCode },
    ], [formatCode]);

    const isCodeModifiedRef = useRef(isCodeModified);
    const openedScriptIndexRef = useRef(openedScriptIndex);
    useEffect(() => {
        isCodeModifiedRef.current = isCodeModified;
    }, [isCodeModified]);
    useEffect(() => {
        openedScriptIndexRef.current = openedScriptIndex;
    }, [openedScriptIndex]);

    const saveCode = useCallback(() => {
        setIsCodeModified(false);
        const openedScriptIndex = openedScriptIndexRef.current;
        if (openedScriptIndex) {
            if (openedScriptIndex.type === 'recv') {
                setScriptConfig(prev => {
                    const newConfig = { ...prev };
                    newConfig.recv_script[openedScriptIndex.index][1] = codeRef.current;
                    return newConfig;
                });
            } else {
                setScriptConfig(prev => {
                    const newConfig = { ...prev };
                    newConfig.send_script[openedScriptIndex.index][1] = codeRef.current;
                    return newConfig;
                });
            }
        }
    }, []);

    const openCode = useCallback((type: 'recv' | 'send', index: number) => {
        const currentOpened = openedScriptIndexRef.current;
        const hasChanges = isCodeModifiedRef.current;
        if (currentOpened && currentOpened.type === type && currentOpened.index === index) {
            return;
        }

        const nextCode = type === 'recv'
            ? (scriptConfig.recv_script[index]?.[1] ?? '')
            : (scriptConfig.send_script[index]?.[1] ?? '');

        const applyOpen = () => {
            setCode(nextCode);
            setOpenedScriptIndex({ type, index });
            setIsCodeModified(false);
            setMenuKeys([`${type}-${index}`]);
        };

        if (hasChanges) {
            setIsModalOpen(true);
            pendingActionRef.current = {
                onSave: () => {
                    saveCode();
                    applyOpen();
                },
                onDiscard: () => {
                    applyOpen();
                }
            };

            return;
        }

        applyOpen();
    }, [scriptConfig]);


    const items: MenuProps['items'] = useMemo(() => [
        {
            key: 'recv',
            label: '接收脚本',
            icon: <DownOutlined />,
            children: scriptConfig.recv_script.map((script, index) => ({
                key: `recv-${index}`,
                label: (
                    <Dropdown menu={{ items: contextItems }} trigger={['contextMenu']}>
                        <div onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}>{script[0]}</div>
                    </Dropdown>
                ),
                onClick: () => {
                    openCode('recv', index);
                }
            })),
        },
        {
            key: 'send',
            label: '发送脚本',
            icon: <UpOutlined />,
            children: scriptConfig.send_script.map((script, index) => ({
                key: `send-${index}`,
                label: (
                    <Dropdown menu={{ items: contextItems }} trigger={['contextMenu']}>
                        <div onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }} >
                            {script[0]}
                        </div>
                    </Dropdown>
                ),
                onClick: () => { openCode('send', index); }
            })),
        }
    ], [scriptConfig, contextItems]);

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
            <Modal title="保存更改？" onCancel={() => {
                setIsModalOpen(false);
                pendingActionRef.current = null;
            }} open={isModalOpen} mask={{ blur: true }} footer={[
                <Button key="save" type="primary" onClick={() => {
                    pendingActionRef.current?.onSave();
                    pendingActionRef.current = null;
                    setIsModalOpen(false);
                }}>
                    是
                </Button>,
                <Button key="no" onClick={() => {
                    pendingActionRef.current?.onDiscard();
                    pendingActionRef.current = null;
                    setIsModalOpen(false);
                }}>
                    否
                </Button>,
                <Button key="cancel" onClick={() => {
                    setIsModalOpen(false);
                    pendingActionRef.current = null;
                }}>
                    取消
                </Button>,
            ]}>
                <p>您有未保存的更改，是否要保存？</p>
            </Modal>
            <div className="main-container">
                <Layout className="main-layout">
                    <Layout.Header className="header">
                        <Button type="primary" className="new-button">
                            <PlusSquareOutlined /> 新建脚本
                        </Button>
                        <Button className="all-button" disabled={!isCodeModified} onClick={saveCode}>
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
                        <Button className="all-button" onClick={formatCode}>
                            <FormatPainterOutlined />
                        </Button>
                    </Layout.Header>
                    <Layout>
                        <Layout.Sider width="180">
                            <Menu
                                selectedKeys={menuKeys}
                                className="sider-menu"
                                defaultOpenKeys={['recv', 'send']}
                                mode="inline"
                                items={items}
                                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
                            />
                        </Layout.Sider>
                        <Layout.Content className="content">
                            <Dropdown menu={{ items: cmItems }} trigger={['contextMenu']}>
                                <CodeMirror
                                    id="cmeditor"
                                    value={code}
                                    height="100%" // 告诉组件占满父容器高度
                                    width="100%"
                                    extensions={[javascript()]}
                                    onChange={(value) => {
                                        setCode(value);
                                        setIsCodeModified(true);
                                    }}
                                    theme={darkMode ? vscodeDark : vscodeLight}
                                    className="coder-mirror-container"
                                />
                            </Dropdown>
                        </Layout.Content>
                    </Layout>
                </Layout>
            </div>
        </ConfigProvider >
    );
}

export default EditorPage;