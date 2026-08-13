import os
import struct
import subprocess
from pathlib import Path

# Resolve base directory
BASE_DIR = Path(__file__).resolve().parent

def generate_logo_ico():
    png_path = os.path.join(str(BASE_DIR), "yoin.png")
    ico_path = os.path.join(str(BASE_DIR), "frontend", "favicon.ico")
    os.makedirs(os.path.dirname(ico_path), exist_ok=True)
    
    # PowerShell script to draw the Yoin logo matching the website design
    ps_draw_script = """
[void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Draw dark blue circle background (matching website theme)
$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 11, 19, 38))
$g.FillEllipse($bgBrush, 8, 8, 240, 240)

# Create gradient pen/brush for the Y and ring
$rect = New-Object System.Drawing.Rectangle 8, 8, 240, 240
$gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, [System.Drawing.Color]::FromArgb(255, 128, 131, 255), [System.Drawing.Color]::FromArgb(255, 255, 220, 197), 45.0)

# Draw Outer Ring
$ringPen = New-Object System.Drawing.Pen ($gradBrush, 12)
$g.DrawEllipse($ringPen, 24, 24, 208, 208)

# Draw stylized Y / download arrow
$yPen = New-Object System.Drawing.Pen ($gradBrush, 16)
$yPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$yPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$yPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

# Draw Y branches
$g.DrawLine($yPen, 85, 80, 128, 128)
$g.DrawLine($yPen, 171, 80, 128, 128)
$g.DrawLine($yPen, 128, 128, 128, 185)

# Draw Arrow Head at bottom of Y
$g.DrawLine($yPen, 100, 155, 128, 185)
$g.DrawLine($yPen, 156, 155, 128, 185)

# Clean up
$ringPen.Dispose()
$yPen.Dispose()
$bgBrush.Dispose()
$gradBrush.Dispose()
$g.Dispose()

# Save PNG
$bmp.Save('""" + png_path.replace("\\", "\\\\") + """', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"""
    try:
        # Run PowerShell drawing script
        subprocess.run(["powershell", "-Command", ps_draw_script], capture_output=True, check=True)
        
        # Read PNG and pack into ICO file format byte-by-byte
        if os.path.exists(png_path):
            with open(png_path, 'rb') as f:
                png_data = f.read()
            
            png_size = len(png_data)
            
            # ICO Header: Reserved (2 bytes, 0), Type (2 bytes, 1 for icon), Count (2 bytes, 1 image)
            ico_header = struct.pack('<HHH', 0, 1, 1)
            
            # Icon Directory Entry: 
            # Width (1 byte, 0 = 256), Height (1 byte, 0 = 256), Colors (1 byte, 0), Reserved (1 byte, 0)
            # Planes (2 bytes, 1), BitCount (2 bytes, 32), Size (4 bytes), Offset (4 bytes, 22)
            icon_entry = struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, png_size, 22)
            
            with open(ico_path, 'wb') as f_out:
                f_out.write(ico_header)
                f_out.write(icon_entry)
                f_out.write(png_data)
                
            # Clean up temporary PNG
            os.remove(png_path)
            return ico_path
    except Exception as e:
        print(f"Failed to generate custom icon: {e}")
    return None

def create_desktop_shortcut():
    try:
        # Generate the Yoin custom icon
        ico_path = generate_logo_ico()
        if not ico_path:
            ico_location = r"C:\Windows\System32\shell32.dll,238"  # Fallback to video strip
        else:
            ico_location = ico_path
            
        # Get user's desktop path
        desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')
        shortcut_path = os.path.join(desktop, 'Yoin.lnk')
        
        target_path = "cmd.exe"
        run_bat = os.path.join(str(BASE_DIR), 'run.bat')
        
        # Prepend cmd.exe /c to run the batch file and close the terminal shell on exit
        arguments = f'/c "{run_bat}"'
        work_dir = str(BASE_DIR)
        
        # PowerShell script to create shortcut
        ps_cmd = (
            f'$s = (New-Object -ComObject WScript.Shell).CreateShortcut("{shortcut_path}"); '
            f'$s.TargetPath = "{target_path}"; '
            f'$s.Arguments = \'{arguments}\'; '
            f'$s.WorkingDirectory = "{work_dir}"; '
            f'$s.IconLocation = "{ico_location}"; '
            f'$s.Save()'
        )
        
        subprocess.run(["powershell", "-Command", ps_cmd], capture_output=True, check=True)
        print("Special shortcut 'Yoin' created on Desktop successfully with Yoin website logo!")
        return True
    except Exception as e:
        print(f"Error creating shortcut: {e}")
        return False

if __name__ == '__main__':
    create_desktop_shortcut()
