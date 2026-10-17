#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 开始游戏.vbs
WSH 默认按系统 ANSI 码页读 .vbs，UTF-8 里的中文会变乱码；
必须写成 UTF-16LE + BOM 才能正确识别中文文件名。
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)

BODY = r'''Option Explicit

' ============================================================
'  霓虹坠落 NEON FALL - 便携启动器
'
'  作用：用 Edge / Chrome 的"应用模式"打开同目录的 霓虹坠落.html，
'        得到一个没有地址栏、没有标签页的独立游戏窗口。
'
'  这是纯文本脚本，不是 exe，所以不会触发 SmartScreen / UAC。
'  如果不想用这个启动器，直接双击 霓虹坠落.html 也能玩。
' ============================================================

Dim fso, sh, baseDir, pagePath, pageUrl, browser, args

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 优先用固定名字，找不到就在目录里找第一个 .html
pagePath = fso.BuildPath(baseDir, "霓虹坠落.html")
If Not fso.FileExists(pagePath) Then
    Dim f, found
    found = ""
    For Each f In fso.GetFolder(baseDir).Files
        If LCase(fso.GetExtensionName(f.Name)) = "html" Then
            found = f.Path
            Exit For
        End If
    Next
    pagePath = found
End If

If pagePath = "" Then
    MsgBox "找不到游戏文件。" & vbCrLf & vbCrLf & _
           "请确保游戏网页（.html 文件）与本启动器在同一个文件夹里。", _
           vbCritical, "霓虹坠落 NEON FALL"
    WScript.Quit 1
End If

pageUrl = PathToUrl(pagePath)

browser = FindBrowser()
If browser = "" Then
    ' 没有 Edge/Chrome，就用系统默认浏览器打开（照样能玩）
    sh.Run """" & pagePath & """", 1, False
    WScript.Quit 0
End If

args = " --app=""" & pageUrl & """" & _
       " --window-size=1120,830" & _
       " --disable-extensions" & _
       " --disable-background-networking" & _
       " --no-first-run" & _
       " --no-default-browser-check" & _
       " --disable-features=Translate"

' 第二个参数 1 = 正常显示（必须用 1，用 0/SW_HIDE 会把 Edge 的窗口一起藏起来，
'                表现就是"点了没反应"）；第三个 False = 立刻返回不等待
sh.Run """" & browser & """" & args, 1, False
WScript.Quit 0


' ---------- 本地路径 -> file:/// URL ----------
Function PathToUrl(p)
    Dim s, i, ch, out
    s = Replace(p, "\", "/")
    If Left(s, 1) <> "/" Then s = "/" & s
    out = ""
    For i = 1 To Len(s)
        ch = Mid(s, i, 1)
        If IsSafeChar(ch) Then
            out = out & ch
        Else
            out = out & PctEncode(ch)
        End If
    Next
    PathToUrl = "file://" & out
End Function

' ---------- 可以直接放进 URL 的字符 ----------
Function IsSafeChar(ch)
    Dim c
    IsSafeChar = False
    If Len(ch) <> 1 Then Exit Function
    c = AscW(ch)
    If c < 0 Then c = c + 65536
    If c > 127 Then Exit Function          ' 非 ASCII 一律编码
    If (c >= 48 And c <= 57) Then IsSafeChar = True    ' 0-9
    If (c >= 65 And c <= 90) Then IsSafeChar = True    ' A-Z
    If (c >= 97 And c <= 122) Then IsSafeChar = True   ' a-z
    ' 注意：冒号必须保留，否则 file:///D:/... 会变成 file:///D%3A/... 打不开
    If ch = "/" Or ch = ":" Or ch = "-" Or ch = "_" Or ch = "." Or ch = "~" Then IsSafeChar = True
End Function

' ---------- 单个字符 -> UTF-8 的 %XX 序列 ----------
Function PctEncode(ch)
    Dim c, b1, b2, b3
    c = AscW(ch)
    If c < 0 Then c = c + 65536
    If c < 128 Then
        PctEncode = "%" & Hex2(c)
    ElseIf c < 2048 Then
        b1 = 192 + (c \ 64)
        b2 = 128 + (c Mod 64)
        PctEncode = "%" & Hex2(b1) & "%" & Hex2(b2)
    Else
        b1 = 224 + (c \ 4096)
        b2 = 128 + ((c \ 64) Mod 64)
        b3 = 128 + (c Mod 64)
        PctEncode = "%" & Hex2(b1) & "%" & Hex2(b2) & "%" & Hex2(b3)
    End If
End Function

Function Hex2(n)
    Dim h
    h = Hex(n)
    If Len(h) < 2 Then h = "0" & h
    Hex2 = h
End Function

' ---------- 按顺序探测 Edge / Chrome ----------
Function FindBrowser()
    Dim f2, s2, pf, pf86, local, cands, i, c
    Set f2 = CreateObject("Scripting.FileSystemObject")
    Set s2 = CreateObject("WScript.Shell")

    pf    = s2.ExpandEnvironmentStrings("%ProgramFiles%")
    pf86  = s2.ExpandEnvironmentStrings("%ProgramFiles(x86)%")
    local = s2.ExpandEnvironmentStrings("%LOCALAPPDATA%")

    cands = Array( _
        pf86  & "\Microsoft\Edge\Application\msedge.exe", _
        pf    & "\Microsoft\Edge\Application\msedge.exe", _
        local & "\Microsoft\Edge\Application\msedge.exe", _
        pf    & "\Google\Chrome\Application\chrome.exe", _
        pf86  & "\Google\Chrome\Application\chrome.exe", _
        local & "\Google\Chrome\Application\chrome.exe" _
    )

    FindBrowser = ""
    For i = 0 To UBound(cands)
        c = cands(i)
        If c <> "" Then
            If f2.FileExists(c) Then
                FindBrowser = c
                Exit Function
            End If
        End If
    Next
End Function
'''

dst_dir = os.path.join(SRC, 'dist')
if not os.path.isdir(dst_dir):
    os.makedirs(dst_dir)
dst = os.path.join(dst_dir, '开始游戏.vbs')
with io.open(dst, 'w', encoding='utf-16-le', newline='\r\n') as f:
    f.write('\ufeff' + BODY.replace('\r\n', '\n'))

size = os.path.getsize(dst)
print('BUILT %s' % dst)
print('SIZE  %d bytes' % size)
