import "./EditorPage.css";
import CodeMirror from "@uiw/react-codemirror";
import React from "react";
import { Layout } from "antd";

const EditorPage: React.FC = () => {
    const [code, setCode] = React.useState<string>("123");
    return (
        <div className="main-container">
            <Layout className="main-layout">
                <Layout.Sider width="25%" className="sider">
                    Sider
                </Layout.Sider>
                <Layout>
                    <Layout.Header className="header" />
                    <Layout.Content className="content">
                        <div className="coderdiv">
                            <CodeMirror className="coder"
                                value={code}
                                // options={{ lineNumbers: true, mode: "javascript", theme: 'material' }}
                                onChange={setCode}
                            />
                        </div>

                    </Layout.Content>
                </Layout>
            </Layout>
        </div>
    );
}

export default EditorPage;