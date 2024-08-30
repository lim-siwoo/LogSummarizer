console.log("test")
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

import { openaiApiKey, firebaseConfig } from './keys.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


// 문자열에서 시간, hostname, log_level, log message 파싱
const parseLogEntry = (filename, line) => {
    const parts = line.split(' ');
    if (parts.length < 6) {
        return null;
    }
    return {
        filename: filename,
        timestamp: `${parts[0]} ${parts[1]} ${parts[2]}`,
        hostname: parts[3],
        log_level: parts[5].replace(':', ''),
        message: parts.slice(6).join(' ')
    };
};

const summarizeLogs = async (logs) => {
    const logMessages = logs.map(log => log.message).join('\n');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that summarizes log data."
                },
                {
                    role: "user",
                    content: `Please summarize the following logs in three sentences:\n\n${logMessages}`
                }
            ],
            max_tokens: 100,
            temperature: 0.7
        })
    });
    const data = await response.json();

    return data.choices[0].message.content.trim();
};



// addDoc 함수를 이용하여 firestore 에 저장
const saveLogToFirestore = async (log) => {
    try {
        const docRef = await addDoc(collection(db, 'kernel_logs'), log);
        console.log('Log entry added with ID: ', docRef.id);
    } catch (error) {
        console.error('Error adding log entry: ', error);
    }
};
const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    const text = await file.text();
    const lines = text.split('\n');
    // 파일에서 로그 파싱
    const logs = lines.map(line => parseLogEntry(file.name, line)).filter(log => log !== null);
    for (const log of logs) {
        // firestore 에 저장
        await saveLogToFirestore(log);
    }
    console.log('All log entries have been uploaded.');
    alert('저장이 완료되었습니다.')
};

const saveButton = document.querySelector('#saveButton');
// 파일이 선택되었을 때의 이벤트 핸들러 추가
saveButton.addEventListener('change', handleFileUpload);

const kernelLogsContainer = document.querySelector('.kernelLogs');
// 화면이 처음 로드될 때 데이터를 가져오는 함수
const loadAllLogs = async () => {
    const q = query(collection(db, 'kernel_logs'), orderBy('timestamp'));
    const querySnapshot = await getDocs(q);
    kernelLogsContainer.innerHTML = ''; // 기존 로그 초기화
    querySnapshot.forEach((doc) => {
        const log = doc.data();
        const filenameElement = document.createElement('div');
        filenameElement.classList.add('log-entry', 'filename');
        filenameElement.textContent = `${log.filename}`
        const logElement = document.createElement('div');
        logElement.classList.add('log-entry', 'log');
        const logLevelElement = document.createElement('span');
        logLevelElement.classList.add(log.log_level.toLowerCase());
        logLevelElement.textContent = `${log.log_level}: ${log.message}`;
        logElement.appendChild(document.createTextNode(`[ ${log.timestamp} ] ${log.hostname} kernel: `));
        logElement.appendChild(logLevelElement);
        kernelLogsContainer.appendChild(filenameElement);
        kernelLogsContainer.appendChild(logElement);
    });
};

await loadAllLogs();

// 실시간 업데이트 리스너 설정
const subscribeToRealTimeUpdates = () => {
    const q = query(collection(db, 'kernel_logs'), orderBy('timestamp'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        kernelLogsContainer.innerHTML = ''; // 기존 로그 초기화
        snapshot.forEach((doc) => {
            const log = doc.data();
            const filenameElement = document.createElement('div');
            filenameElement.classList.add('log-entry', 'filename');
            filenameElement.textContent = `${log.filename}`
            const logElement = document.createElement('div');
            logElement.classList.add('log-entry', 'log');
            const logLevelElement = document.createElement('span');
            logLevelElement.classList.add(log.log_level.toLowerCase());
            logLevelElement.textContent = `${log.log_level}: ${log.message}`;

            logElement.appendChild(document.createTextNode(`[ ${log.timestamp} ] ${log.hostname} kernel: `));
            logElement.appendChild(logLevelElement);

            kernelLogsContainer.appendChild(filenameElement);
            kernelLogsContainer.appendChild(logElement);
        });
    });
};
subscribeToRealTimeUpdates();


// 최근 10개의 로그를 가져오는 함수
const loadRecentLogs = async () => {
    const q = query(collection(db, 'kernel_logs'), orderBy('timestamp', 'desc'), limit(10));
    const querySnapshot = await getDocs(q);
    kernelLogsContainer.innerHTML = ''; // 기존 로그 초기화

    querySnapshot.forEach((doc) => {
        const log = doc.data();
        const filenameElement = document.createElement('div');
        filenameElement.classList.add('log-entry', 'filename');
        filenameElement.textContent = `${log.filename}`
        const logElement = document.createElement('div');
        logElement.classList.add('log-entry', 'log');
        const logLevelElement = document.createElement('span');
        logLevelElement.classList.add(log.log_level.toLowerCase());
        logLevelElement.textContent = `${log.log_level}: ${log.message}`;
        logElement.appendChild(document.createTextNode(`[ ${log.timestamp} ] ${log.hostname} kernel: `));
        logElement.appendChild(logLevelElement);
        kernelLogsContainer.appendChild(filenameElement);
        kernelLogsContainer.appendChild(logElement);
    });
};
// 최근 10개 로그 버튼 클릭 이벤트 핸들러 추가
document.querySelector('#recentLogsButton').addEventListener('click', async () => {
    await loadRecentLogs();
});
// 전체 로그 데이터를 가져올 수 있도록 이벤트 핸들러 추가
document.querySelector('#allLogsButton').addEventListener('click', async () => {
    await loadAllLogs();
});

// 로그 요약 버튼 클릭 이벤트 핸들러 추가
document.querySelector('#summarizeLogsButton').addEventListener('click', async () => {
    const q = query(collection(db, 'kernel_logs'), orderBy('timestamp'));
    const querySnapshot = await getDocs(q);
    const logs = [];
    querySnapshot.forEach((doc) => {
        logs.push(doc.data());
    });
    const summary = await summarizeLogs(logs);
    const summarizeLogsContainer = document.querySelector('.summarizeLogs');
    summarizeLogsContainer.innerHTML = '';
    const summaryElement = document.createElement('div');
    summaryElement.textContent = summary;
    summarizeLogsContainer.appendChild(summaryElement);
    // alert(summary);

});