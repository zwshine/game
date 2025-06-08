// js/imei-logic.js

document.addEventListener('DOMContentLoaded', function() {
    // 这里可以放置所有需要等待DOM加载完毕后执行的初始化代码
});

function luhnCheck(imei) {
    if (!imei || imei.length !== 15 || !/^\d+$/.test(imei)) {
        return false;
    }
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        let digit = parseInt(imei[i]);
        if ((i + 1) % 2 === 0) { // 注意：Luhn算法通常是从右往左，但对于IMEI，从左往右数偶数位也是一种常见实现
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(imei[14]);
}

function calculateCheckDigit(partialImei) {
    let sum = 0;
    for (let i = 0; i < partialImei.length; i++) {
        let digit = parseInt(partialImei[i]);
        if ((i % 2) !== 0) { // 从1开始数，第2，4，6...位
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    return (10 - (sum % 10)) % 10;
}


function analyzeImei() {
    const imeiInput = document.getElementById('original-imei').value.trim();
    const statusElement = document.getElementById('original-status');
    
    if (!imeiInput || imeiInput.length !== 15 || !/^\d+$/.test(imeiInput)) {
        statusElement.textContent = "× 无效：IMEI必须为15位纯数字。";
        statusElement.className = "status show invalid";
        return;
    }
    
    const isValid = luhnCheck(imeiInput);
    
    statusElement.textContent = isValid ? '✓ 有效的IMEI' : '⚠ 无效的IMEI (Luhn校验失败)';
    statusElement.className = `status show ${isValid ? 'valid' : 'invalid'}`;
}

function modifyAndGenerate() {
    const originalImei = document.getElementById('original-imei').value.trim();
    if (originalImei.length !== 15 || !/^\d+$/.test(originalImei)) {
        alert("请输入一个有效的15位原始IMEI。");
        return;
    }

    const modifyTAC = document.getElementById('modify-tac').checked;
    const modifyFAC = document.getElementById('modify-fac').checked;
    const modifySNR = document.getElementById('modify-snr').checked;

    let newImeiBase = originalImei.substring(0, 14);

    if (modifyTAC) {
        const tacPreset = document.getElementById('tac-preset').value;
        let newTAC;
        if (tacPreset === 'random') {
            newTAC = String(Math.floor(Math.random() * 900000) + 100000); // 随机6位数
        } else {
            newTAC = tacPreset + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        }
        newImeiBase = newTAC + newImeiBase.substring(6);
    }
    
    if (modifyFAC) {
        // FAC是TAC的一部分，所以这里我们仅作概念演示，实际TAC已变
        let currentTac = newImeiBase.substring(0, 8); // TAC实际上是8位
        // 实际上现代IMEI已无FAC，此处仅为逻辑保留
    }

    if (modifySNR) {
        let snrInput = document.getElementById('snr-input').value.trim();
        let newSNR = snrInput || String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
        newImeiBase = newImeiBase.substring(0, 8) + newSNR.substring(0, 6);
    }

    const checkDigit = calculateCheckDigit(newImeiBase);
    const newImei = newImeiBase + checkDigit;
    
    displayNewImei(newImei);
}

function displayNewImei(imei) {
    const list = document.getElementById('new-imei-list');
    const entry = document.createElement('div');
    entry.className = 'imei-result';
    entry.innerHTML = `
        <span>${imei}</span>
        <button onclick="copyToClipboard('${imei}')">复制</button>
    `;
    list.prepend(entry);
    if(list.children.length > 5) {
        list.removeChild(list.lastChild);
    }
}

function clearAll() {
    document.getElementById('original-imei').value = '';
    const status = document.getElementById('original-status');
    status.textContent = '';
    status.className = 'status';
    document.getElementById('new-imei-list').innerHTML = '';
    document.getElementById('snr-input').value = '';
    
    // 清空校验码计算器部分
    document.getElementById('imei-prefix').value = '';
    const checksumResult = document.getElementById('checksum-result');
    checksumResult.textContent = '';
    checksumResult.className = 'status';
}

function calculateAndShowChecksum() {
    const prefixInput = document.getElementById('imei-prefix').value.trim();
    const resultElement = document.getElementById('checksum-result');

    if (!prefixInput || prefixInput.length !== 14 || !/^\d+$/.test(prefixInput)) {
        resultElement.textContent = "× 无效：请输入14位纯数字。";
        resultElement.className = "status show invalid";
        return;
    }

    const checkDigit = calculateCheckDigit(prefixInput);
    const fullImei = prefixInput + checkDigit;

    resultElement.innerHTML = `✓ 计算成功！完整IMEI: <strong>${fullImei}</strong> (校验码: ${checkDigit})`;
    resultElement.className = "status show valid";
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('已复制: ' + text);
    }).catch(err => {
        console.error('无法复制: ', err);
        alert('复制失败!');
    });
} 