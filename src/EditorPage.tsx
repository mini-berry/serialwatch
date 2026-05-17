import "./EditorPage.css";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import React from "react";
import { UndoOutlined, RedoOutlined, UpOutlined, DownOutlined, DeleteOutlined, EditOutlined, PlusSquareOutlined, SaveOutlined, ScissorOutlined, SnippetsOutlined, CopyOutlined, FormatPainterOutlined } from "@ant-design/icons";
import { Layout, ConfigProvider, theme, Menu, Dropdown, Button, Modal, Input, Radio } from "antd";
import { useSyncExternalStore } from 'react';
import type { MenuProps } from 'antd';
import { useCallback, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import parserEstree from 'prettier/plugins/estree';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { undo, redo, history, historyField } from "@codemirror/commands";
import { EditorState, keymap } from "@uiw/react-codemirror";

interface ScriptConfig {
    recv_script: [string, string][];
    send_script: [string, string][];
}

const EditorPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const pendingActionRef = useRef<null | { onSave: () => void | Promise<void>; onDiscard: () => void }>(null);
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
    const scriptConfigRef = useRef<ScriptConfig>(scriptConfig);
    useEffect(() => {
        scriptConfigRef.current = scriptConfig;
    }, [scriptConfig]);
    const newScript = async () => {
        let newScriptConfig = scriptConfigRef.current;
        let oldScriptConfig = scriptConfigRef.current;
        const name = newScriptNameRef.current.trim();
        if (!name) {
            return;
        }
        let nameList;
        if (newScriptTypeRef.current === 'recv') {
            nameList = oldScriptConfig.recv_script.map(s => s[0]);
        }
        else {
            nameList = oldScriptConfig.send_script.map(s => s[0]);
        }
        let nameIndex = 1;
        let finalName = name;
        while (nameList.includes(finalName)) {
            finalName = `${name}(${nameIndex})`;
            nameIndex++;
        }
        if (newScriptTypeRef.current === 'recv') {
            newScriptConfig = {
                ...oldScriptConfig,
                recv_script: [...oldScriptConfig.recv_script, [finalName, '']]
            };
        } else {
            newScriptConfig = {
                ...oldScriptConfig,
                send_script: [...oldScriptConfig.send_script, [finalName, '']]
            };
        }
        setScriptConfig(newScriptConfig);
        try {
            await invoke('save_script_config', { newConfig: newScriptConfig }).then(() => {
                const newIndex = (newScriptTypeRef.current === 'recv' ? newScriptConfig.recv_script.length : newScriptConfig.send_script.length) - 1;
                openCode(newScriptTypeRef.current, newIndex);
            });
        } catch (error) {
            console.error('Failed to save script config:', error);
        }
    };
    const [menuKeys, setMenuKeys] = React.useState<string[]>([]);
    useEffect(() => {
        invoke('load_script_config').then((scripts) => {
            let scriptsConfig = scripts as ScriptConfig || { recv_script: [], send_script: [] };
            setScriptConfig(scriptsConfig);
        });
    }, []);
    const [code, setCode] = React.useState<string>("");
    const codeRef = useRef(code);
    const editorViewRef = useRef<EditorView | null>(null);
    const [undoAvailable, setUndoAvailable] = React.useState(false);
    const [redoAvailable, setRedoAvailable] = React.useState(false);
    const [cmSelected, setCmSelected] = React.useState(false);
    const updateListener = EditorView.updateListener.of((update) => {
        if (update.selectionSet) {
            const hasSelection = !update.state.selection.main.empty;
            setCmSelected(hasSelection);
        }
    });
    const updateUndoRedoState = () => {
        const view = editorViewRef.current;
        if (!view) return;
        const hist = view.state.field(historyField, false) as any;
        if (!hist) return;
        setUndoAvailable(hist.done.length > 1);
        setRedoAvailable(hist.undone.length > 0);
    };

    useEffect(() => {
        codeRef.current = code;
    }, [code]);
    const [isCodeModified, setIsCodeModified] = React.useState<boolean>(false);
    const [hasOpened, setHasOpened] = React.useState<boolean>(false);
    const openedScriptIndexRef = useRef<{ type: 'recv' | 'send'; index: number } | null>(null);
    const formatCode = async () => {
        try {
            const oldCode = codeRef.current;
            const formattedCode = await prettier.format(oldCode, {
                parser: "babel",
                plugins: [parserBabel, parserEstree],
                semi: true,
                singleQuote: true,
                tabWidth: 2,
                endOfLine: "auto",
            });
            if (formattedCode !== oldCode) {
                setIsCodeModified(true);
            }
            setCode(formattedCode);
        } catch (_error) {
            console.error('代码格式化失败:', _error);
        }
    };

    const onPasteCode = useCallback(async () => {
        try {
            const text = await readText();
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
    }, []);

    const onUndo = useCallback(() => {
        const view = editorViewRef.current;
        if (!view) return;
        undo(view);
        updateUndoRedoState();
    }, [updateUndoRedoState]);
    const onRedo = useCallback(() => {
        const view = editorViewRef.current;
        if (!view) return;
        redo(view);
        updateUndoRedoState();
    }, [updateUndoRedoState]);

    const onCopyCode = useCallback(async () => {
        try {
            const view = editorViewRef.current;
            if (!view) return;
            const { from, to } = view.state.selection.main;
            const selectedText = view.state.sliceDoc(from, to);
            await writeText(selectedText);
            view.focus();
        } catch (err) {
            console.error('Failed to write clipboard contents: ', err);
        }
    }, []);

    const onCutCode = useCallback(async () => {
        try {
            const view = editorViewRef.current;
            if (!view) return;
            const { from, to } = view.state.selection.main;
            const selectedText = view.state.sliceDoc(from, to);
            await writeText(selectedText);
            view.dispatch({
                changes: {
                    from,
                    to,
                    insert: '',
                },
                selection: {
                    anchor: from,
                },
            });
            const newCode = view.state.doc.toString();
            setCode(newCode);
            setIsCodeModified(true);
            view.focus();
        } catch (err) {
            console.error('Failed to write clipboard contents: ', err);
        }
    }, []);


    const isCodeModifiedRef = useRef(isCodeModified);
    useEffect(() => {
        isCodeModifiedRef.current = isCodeModified;
    }, [isCodeModified]);

    const saveCode = useCallback(async () => {
        const openedScriptIndex = openedScriptIndexRef.current;
        if (openedScriptIndex) {
            const currentConfig = scriptConfigRef.current;
            const newScriptConfig: ScriptConfig = {
                recv_script: currentConfig.recv_script.map((item) => [...item] as [string, string]),
                send_script: currentConfig.send_script.map((item) => [...item] as [string, string]),
            };
            if (openedScriptIndex.type === 'recv') {
                newScriptConfig.recv_script[openedScriptIndex.index][1] = codeRef.current;
            } else {
                newScriptConfig.send_script[openedScriptIndex.index][1] = codeRef.current;
            }
            setScriptConfig(newScriptConfig);
            try {
                await invoke('save_script_config', { newConfig: newScriptConfig });
                setIsCodeModified(false);
            } catch (error) {
                console.error('Failed to save script config:', error);
            }
        };
    }, []);

    const saveKeymap = useMemo(() => keymap.of([
        {
            key: "Mod-s",  // Mod = Ctrl on Windows/Linux, Cmd on Mac
            run: () => {
                saveCode();
                return true; // 返回 true 阻止默认浏览器行为（例如浏览器保存页面）
            }
        },
        {
            key: "Alt-Shift-f",
            run: () => {
                formatCode();
                return true;
            }
        }
    ]), [saveCode, formatCode]);

    const deleteCode = async (type: 'recv' | 'send', index: number) => {
        const currentOpened = openedScriptIndexRef.current;
        const currentConfig = scriptConfigRef.current;
        const newScriptConfig: ScriptConfig = {
            recv_script: currentConfig.recv_script.map((item) => [...item] as [string, string]),
            send_script: currentConfig.send_script.map((item) => [...item] as [string, string]),
        };
        newScriptConfig[type === 'recv' ? 'recv_script' : 'send_script'] =
            newScriptConfig[type === 'recv' ? 'recv_script' : 'send_script'].filter((_, i) => i !== index);

        setScriptConfig(newScriptConfig);

        try {
            await invoke('save_script_config', { newConfig: newScriptConfig });
        } catch (error) {
            console.error('Failed to save script config:', error);
        }

        if (currentOpened && currentOpened.type === type && currentOpened.index === index) {
            setTimeout(() => {
                setCode('');
                openedScriptIndexRef.current = null;
                setMenuKeys([]);
                setHasOpened(false);
            }, 0);
        }
    };

    const openCode = useCallback((type: 'recv' | 'send', index: number) => {
        setHasOpened(true);
        const currentOpened = openedScriptIndexRef.current;
        const hasChanges = isCodeModifiedRef.current;
        if (currentOpened && currentOpened.type === type && currentOpened.index === index) {
            return;
        }

        const nextCode = type === 'recv'
            ? (scriptConfigRef.current.recv_script[index]?.[1] ?? '')
            : (scriptConfigRef.current.send_script[index]?.[1] ?? '');

        const applyOpen = () => {
            setCode(nextCode);
            openedScriptIndexRef.current = { type, index };
            setIsCodeModified(false);
            setMenuKeys([`${type}-${index}`]);
            const view = editorViewRef.current;
            setRedoAvailable(false);
            setUndoAvailable(false);

            if (view) {
                const state = EditorState.create({
                    doc: nextCode,
                    extensions: [[javascript(), history(), updateListener, saveKeymap]],
                });
                view.setState(state);
                view.focus();
            }
        };

        if (hasChanges && currentOpened) {
            setIsModalOpen(true);
            pendingActionRef.current = {
                onSave: async () => {
                    await saveCode();
                    applyOpen();
                },
                onDiscard: () => {
                    applyOpen();
                }
            };

            return;
        }

        applyOpen();
    }, [saveCode, updateListener, saveKeymap]);

    const getContextItems = useCallback((index: number, type: 'recv' | 'send') => [
        { key: '1', label: '编辑', icon: <EditOutlined />, onClick: () => { openCode(type, index) } },
        { key: '2', label: '删除', icon: <DeleteOutlined />, onClick: () => { deleteCode(type, index) } },
    ], [openCode, deleteCode]);
    const cmItems: MenuProps['items'] = useMemo(() => [
        { key: '1', label: '复制', icon: <CopyOutlined />, onClick: onCopyCode, disabled: !cmSelected },
        { key: '2', label: '剪切', icon: <ScissorOutlined />, onClick: onCutCode, disabled: !cmSelected },
        { key: '3', label: '粘贴', icon: <SnippetsOutlined />, onClick: onPasteCode },
        { key: '4', label: '格式化', icon: <FormatPainterOutlined />, onClick: formatCode },
    ], [formatCode, cmSelected, onCopyCode, onCutCode, onPasteCode]);

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
    ], [scriptConfig, getContextItems, openCode]);

    const editorExtensions = useMemo(() => [javascript(), history(), updateListener, saveKeymap], [updateListener, saveKeymap]);

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
                        <Button className="all-button" disabled={!isCodeModified || !hasOpened} onClick={saveCode} title="保存代码(Ctrl+S)">
                            <SaveOutlined />
                        </Button>
                        <Button className="all-button" onClick={onUndo} disabled={!undoAvailable || !hasOpened} title="撤销(Ctrl+Z)">
                            <UndoOutlined />
                        </Button>
                        <Button className="all-button" onClick={onRedo} disabled={!redoAvailable || !hasOpened} title="重做(Ctrl+Y)">
                            <RedoOutlined />
                        </Button>
                        <Button className="all-button" onClick={onCopyCode} disabled={!cmSelected || !hasOpened} title="复制(Ctrl+C)">
                            <CopyOutlined />
                        </Button>
                        <Button className="all-button" onClick={onCutCode} disabled={!cmSelected || !hasOpened} title="剪切(Ctrl+X)">
                            <ScissorOutlined />
                        </Button>
                        <Button className="all-button" onClick={onPasteCode} title="粘贴(Ctrl+V)" disabled={!hasOpened}>
                            <SnippetsOutlined />
                        </Button>
                        <Button className="all-button" onClick={formatCode} title="格式化(Alt+Shift+F)" disabled={!hasOpened}>
                            <FormatPainterOutlined />
                        </Button>
                    </Layout.Header>
                    <Layout>
                        <Layout.Sider width="180">
                            <Menu
                                selectedKeys={menuKeys}
                                className="sider-menu no-select"
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
                                    extensions={editorExtensions}
                                    onCreateEditor={(view) => {
                                        editorViewRef.current = view;
                                    }}
                                    onChange={(value) => {
                                        setCode(value);
                                        setIsCodeModified(true);
                                        updateUndoRedoState();
                                    }}
                                    theme={darkMode ? vscodeDark : vscodeLight}
                                    className="coder-mirror-container"
                                    style={{ display: hasOpened ? '' : 'none' }}
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