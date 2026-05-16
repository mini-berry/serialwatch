import "./EditorPage.css";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import React from "react";
import { UpOutlined, DownOutlined, DeleteOutlined, EditOutlined, PlusSquareOutlined, SaveOutlined, ScissorOutlined, SnippetsOutlined, CopyOutlined, FormatPainterOutlined } from "@ant-design/icons";
import { Layout, ConfigProvider, theme, Menu, Dropdown, Button, Modal, Input, Radio } from "antd";
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
    const [newModalOpen, setNewModalOpen] = React.useState(false);
    const [newScriptName, setNewScriptName] = React.useState<string>('New script');
    const newScriptNameRef = useRef<string>('New script');
    useEffect(() => {
        newScriptNameRef.current = newScriptName;
    }, [newScriptName]);
    const newScriptTypeRef = useRef<'recv' | 'send'>('recv');
    const [scriptConfig, setScriptConfig] = React.useState<ScriptConfig>({
        recv_script: [],
        send_script: []
    });
    const newScript = useCallback(() => {
        const name = newScriptNameRef.current.trim();
        if (!name) {
            return;
        }
        let nameList;
        if (newScriptTypeRef.current === 'recv') {
            nameList = scriptConfig.recv_script.map(s => s[0]);
        }
        else {
            nameList = scriptConfig.send_script.map(s => s[0]);
        }
        let nameIndex = 1;
        let finalName = name;
        while (nameList.includes(finalName)) {
            finalName = `${name}(${nameIndex})`;
            nameIndex++;
        }
        if (newScriptTypeRef.current === 'recv') {
            setScriptConfig(prev => ({
                ...prev,
                recv_script: [...prev.recv_script, [finalName, '']]
            }));
        } else {
            setScriptConfig(prev => ({
                ...prev,
                send_script: [...prev.send_script, [finalName, '']]
            }));
        }
    }, [scriptConfig]);
    const [menuKeys, setMenuKeys] = React.useState<string[]>([]);
    useEffect(() => {
        invoke('load_script_config').then((scripts) => {
            let scriptsConfig = scripts as ScriptConfig || { recv_script: [], send_script: [] };
            setScriptConfig(scriptsConfig);
        });
    }, []);
    const [code, setCode] = React.useState<string>("console.log('Hello World');\n");
    const codeRef = useRef(code);
    const editorViewRef = useRef<EditorView | null>(null);
    useEffect(() => {
        codeRef.current = code;
    }, [code]);
    const [isCodeModified, setIsCodeModified] = React.useState<boolean>(false);
    const openedScriptIndexRef = useRef<{ type: 'recv' | 'send'; index: number } | null>(null);
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

    const onPasteCode = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const view = editorViewRef.current;
            if (!view) return;

            const { from, to } = view.state.selection.main;
            const cursorPos = from + text.length;
            view.dispatch({
                changes: {
                    from,
                    to,
                    insert: text,
                },
                selection: {
                    anchor: cursorPos,
                },
            });

            const newCode = view.state.doc.toString();
            setCode(newCode);
            setIsCodeModified(true);

            // 聚焦编辑器
            view.focus();
        } catch (err) {
            console.error('Failed to read clipboard contents: ', err);
        }
    };

    const getContextItems = (index: number, type: 'recv' | 'send') => [
        { key: '1', label: '编辑', icon: <EditOutlined />, onClick: () => { openCode(type, index) } },
        { key: '2', label: '删除', icon: <DeleteOutlined />, onClick: () => { deleteCode(type, index) } },
    ];
    const cmItems: MenuProps['items'] = useMemo(() => [
        { key: '1', label: '复制', icon: <CopyOutlined /> },
        { key: '2', label: '剪切', icon: <ScissorOutlined /> },
        { key: '3', label: '粘贴', icon: <DeleteOutlined />, onClick: onPasteCode },
        { key: '4', label: '格式化', icon: <FormatPainterOutlined />, onClick: formatCode },
    ], [formatCode]);

    const isCodeModifiedRef = useRef(isCodeModified);
    useEffect(() => {
        isCodeModifiedRef.current = isCodeModified;
    }, [isCodeModified]);

    const saveCode = () => {
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
    };



    const deleteCode = useCallback((type: 'recv' | 'send', index: number) => {
        const currentOpened = openedScriptIndexRef.current;
        if (currentOpened && currentOpened.type === type && currentOpened.index === index) {
            setMenuKeys([]);
            setCode('');
            openedScriptIndexRef.current = null;
        }
        scriptConfig[type === 'recv' ? 'recv_script' : 'send_script'].splice(index, 1);
        setScriptConfig(prev => ({ ...prev }));
    }, [scriptConfig]);

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
            openedScriptIndexRef.current = { type, index };
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
                    <Dropdown menu={{ items: getContextItems(index, 'recv') }} trigger={['contextMenu']}>
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
                    <Dropdown menu={{ items: getContextItems(index, 'send') }} trigger={['contextMenu']}>
                        <div onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }} >
                            {script[0]}
                        </div>
                    </Dropdown>
                ),
                onClick: () => { openCode('send', index); }
            })),
        }
    ], [scriptConfig]);

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
            <Modal title="新建脚本" width={300} okText="创建" cancelText="取消" mask={{ blur: true }} open={newModalOpen} onCancel={() => setNewModalOpen(false)} onOk={() => { newScript(); setNewModalOpen(false); }}>
                <p>类型</p>
                <Radio.Group defaultValue="recv" onChange={(e) => newScriptTypeRef.current = e.target.value}>
                    <Radio value="recv">接收脚本</Radio>
                    <Radio value="send">发送脚本</Radio>
                </Radio.Group>
                <p>名称：</p>
                <Input placeholder="脚本名称" onChange={(e) => setNewScriptName(e.target.value)} value={newScriptName} />
            </Modal>
            <Modal title="保存更改？" width={300} onCancel={() => {
                setIsModalOpen(false);
                pendingActionRef.current = null;
            }} open={isModalOpen} mask={{ blur: true }} footer={[
                <Button key="save" type="primary"
                    style={{ 'width': '60px' }}
                    onClick={() => {
                        pendingActionRef.current?.onSave();
                        pendingActionRef.current = null;
                        setIsModalOpen(false);
                    }}>
                    保存
                </Button>,
                <Button key="no" style={{ 'width': '60px' }}
                    onClick={() => {
                        pendingActionRef.current?.onDiscard();
                        pendingActionRef.current = null;
                        setIsModalOpen(false);
                    }}>
                    不保存
                </Button>,
                <Button key="cancel" style={{ 'width': '60px' }} onClick={() => {
                    setIsModalOpen(false);
                    pendingActionRef.current = null;
                }}>
                    取消
                </Button>,
            ]}>
                <p style={{ 'height': '60px' }}>您有未保存的更改，是否要保存？</p>
            </Modal>
            <div className="main-container">
                <Layout className="main-layout">
                    <Layout.Header className="header">
                        <Button type="primary" className="new-button" onClick={() => setNewModalOpen(true)}>
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
                        <Button className="all-button" onClick={onPasteCode}>
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
                                    onCreateEditor={(view) => {
                                        editorViewRef.current = view;
                                    }}
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