import * as os from 'os';
import * as child_process from 'child_process';
import * as pidusage from 'pidusage';
import { BaseServiceModule } from "service-starter";

import { LogManager } from "./LogManager/LogManager";
import { FileManager } from "../FileManager/FileManager";

/**
 * 用户任务管理器
 */
export class TaskManager extends BaseServiceModule {

    //存放正在执行的任务。key：文件路径
    private readonly _taskList: Map<string, child_process.ChildProcess> = new Map();
    private _logManager: LogManager;

    async onStart(): Promise<void> {
        this._logManager = this.services.LogManager;
    }

    /**
     * 创建一个新的任务。如果任务正在运行，则不执行任何操作
     */
    createTask(taskFilePath: string): void {
        if (!taskFilePath.startsWith(FileManager._userCodeDir))
            throw new Error(`不能为 '${FileManager._userCodeDir}' 目录外的文件创建任务`);

        if (!taskFilePath.endsWith('.js'))
            throw new Error('只能为 js 类型的文件创建任务');

        if (!this._taskList.has(taskFilePath)) {    //确保要创建的任务并未处于运行状态
            const child = child_process.fork(taskFilePath, [], {
                cwd: FileManager._programDataDir,
                uid: 6000,
                gid: 6000
            });

            const logger = this._logManager.createTaskLogger(taskFilePath);

            logger.status.value = 'running';

            child.stdout.on('data', chunk => logger.addLog(false, chunk.toString()));
            child.stderr.on('data', chunk => logger.addLog(true, chunk.toString()));

            child.on('close', (code, signal) => {
                logger.status.value = code === 0 || signal === 'SIGTERM' ? 'stop' : 'crashed';
                this._taskList.delete(taskFilePath);
            });

            this._taskList.set(taskFilePath, child);
        }
    }

    /**
     * 删除某个正在运行的任务，如果任务不存在，则不执行任何操作
     */
    destroyTask(taskFilePath: string): void {
        const child = this._taskList.get(taskFilePath);
        if (child) child.kill();
    }

    /**
     * 获取某个正在运行的任务，资源消耗的情况，如果任务不存在则返回空
     */
    async getTaskResourcesConsumption(taskFilePath: string): Promise<pidusage.Stat | undefined> {
        const child = this._taskList.get(taskFilePath);
        if (child) return await pidusage(process.pid);
    }

    /**
     * 获取计算机的硬件信息
     */
    getSystemHardwareInfo() {
        const cpu = os.cpus();

        return {
            cpuNumber: cpu.length,
            cpuName: cpu[0].model,
            domain: process.env.DOMAIN,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            uptime: os.uptime() //系统运行了多久了
        };
    }
}